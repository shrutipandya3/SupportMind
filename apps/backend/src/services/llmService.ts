// apps/backend/src/services/llmService.ts
import { GoogleGenAI } from "@google/genai";

/* ----------------------------- Types ----------------------------- */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export type LlmStopReason =
  | "stop"
  | "max_tokens"
  | "content_filter"
  | "aborted"
  | "other";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export interface LlmResult {
  text: string; // full assembled text
  stopReason: LlmStopReason;
  rawStopReason?: string| undefined; // Gemini's original finishReason
  usage: LlmUsage;
  model: string;
}

export interface LlmStream {
  /** Iterate this to receive text pieces as they arrive. */
  textStream: AsyncGenerator<string, void, void>;
  /** Resolves after textStream is fully consumed. Rejects if the stream fails. */
  result: Promise<LlmResult>;
}

export interface StreamChatParams {
  systemPrompt: string;
  messages: LlmMessage[];
  options?: LlmOptions;
}

export type LlmErrorCode = "ABORTED" | "TIMEOUT" | "CONFIG" | "API";

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: LlmErrorCode,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/* ----------------------------- Config ---------------------------- */

interface LlmConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

// Read lazily so it works regardless of when dotenv loads.
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new LlmError(`Env var ${name} must be a number, got "${raw}"`, "CONFIG");
  }
  return n;
}

function loadConfig(): LlmConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey) throw new LlmError("GEMINI_API_KEY is not set", "CONFIG");
  if (!model) throw new LlmError("GEMINI_MODEL is not set", "CONFIG");

  return {
    apiKey,
    model,
    maxTokens: readNumber("GEMINI_MAX_TOKENS", 1024),
    temperature: readNumber("GEMINI_TEMPERATURE", 0.3),
    timeoutMs: readNumber("GEMINI_TIMEOUT_MS", 30_000),
    retryCount: readNumber("GEMINI_RETRY_COUNT", 2),
    retryDelayMs: readNumber("GEMINI_RETRY_DELAY_MS", 500),
  };
}

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

/* ----------------------------- Helpers --------------------------- */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new LlmError("Aborted", "ABORTED"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new LlmError("Aborted", "ABORTED"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" ? status : undefined;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof LlmError) return err.code === "TIMEOUT";
  const status = getStatus(err);
  if (status !== undefined) return [408, 429, 500, 502, 503, 504].includes(status);
  // No HTTP status -> most likely a network-level failure (ECONNRESET, DNS, etc.)
  return true;
}

function mapStopReason(reason?: string): LlmStopReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content_filter";
    default:
      return "other";
  }
}

function toGeminiContents(messages: LlmMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/* ----------------------------- Main API -------------------------- */

export function streamChat({
  systemPrompt,
  messages,
  options = {},
}: StreamChatParams): LlmStream {
  let resolveResult!: (r: LlmResult) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<LlmResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });
  result.catch(() => {}); // avoid unhandled rejection if caller only reads textStream

  async function* generate(): AsyncGenerator<string, void, void> {
    try {
      const cfg = loadConfig();
      const model = options.model ?? cfg.model;
      const maxTokens = options.maxTokens ?? cfg.maxTokens;
      const temperature = options.temperature ?? cfg.temperature;
      const ai = getClient(cfg.apiKey);
      const callerSignal = options.abortSignal;

      let fullText = "";
      let rawStopReason: string | undefined;
      let usage: LlmUsage = {
        inputTokens: 0,
        outputTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
      };
      let emitted = false; // once true, we can no longer safely retry

      for (let attempt = 0; attempt <= cfg.retryCount; attempt++) {
        if (callerSignal?.aborted) throw new LlmError("Aborted", "ABORTED");

        // Per-attempt timeout combined with the caller's abort signal.
        const timeoutSignal = AbortSignal.timeout(cfg.timeoutMs);
        const signal = callerSignal
          ? AbortSignal.any([callerSignal, timeoutSignal])
          : timeoutSignal;

        try {
          const stream = await ai.models.generateContentStream({
            model,
            contents: toGeminiContents(messages),
            config: {
              systemInstruction: systemPrompt,
              maxOutputTokens: maxTokens,
              temperature,
              abortSignal: signal,
            },
          });

          for await (const chunk of stream) {
            const piece = chunk.text;
            if (piece) {
              emitted = true;
              fullText += piece;
              yield piece;
            }
            const finish = chunk.candidates?.[0]?.finishReason;
            if (finish) rawStopReason = String(finish);

            const u = chunk.usageMetadata;
            if (u) {
              usage = {
                inputTokens: u.promptTokenCount ?? 0,
                outputTokens: u.candidatesTokenCount ?? 0,
                thoughtTokens: u.thoughtsTokenCount ?? 0,
                totalTokens: u.totalTokenCount ?? 0,
              };
            }
          }

          resolveResult({
            text: fullText,
            stopReason: mapStopReason(rawStopReason),
            rawStopReason,
            usage,
            model,
          });
          return;
        } catch (err) {
          if (callerSignal?.aborted) throw new LlmError("Aborted", "ABORTED");

          const timedOut = timeoutSignal.aborted;
          const wrapped =
            err instanceof LlmError
              ? err
              : timedOut
                ? new LlmError(`Gemini request timed out after ${cfg.timeoutMs}ms`, "TIMEOUT", undefined, err)
                : new LlmError(
                    err instanceof Error ? err.message : "Gemini request failed",
                    "API",
                    getStatus(err),
                    err
                  );

          const canRetry = !emitted && attempt < cfg.retryCount && isRetryable(wrapped.code === "API" ? err : wrapped);
          if (!canRetry) throw wrapped;

          await sleep(cfg.retryDelayMs * 2 ** attempt, callerSignal); // exponential backoff
        }
      }
    } catch (err) {
      rejectResult(err);
      throw err;
    }
  }

  return { textStream: generate(), result };
}