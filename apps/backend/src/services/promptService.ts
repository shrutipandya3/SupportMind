// apps/backend/src/services/promptService.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PromptVersion } from "../db/models/PromptVersion.js";

const PROMPTS_DIR = process.env.PROMPTS_DIR ?? path.resolve(process.cwd(), "prompts");
const FILE_RE = /^v(\d+)\.txt$/;

export class PromptIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptIntegrityError";
  }
}

export interface ActivePrompt {
  id: string; // PromptVersion _id, store this on messages / usage logs
  name: string;
  version: number;
  text: string;
}

interface PromptFile {
  name: string;
  version: number;
  text: string;
  contentHash: string;
  filePath: string;
}

export function hashPromptText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// CRLF -> LF so Windows git checkouts don't change the hash.
const normalize = (raw: string) => raw.replace(/\r\n/g, "\n");

async function readPromptFiles(): Promise<PromptFile[]> {
  const result: PromptFile[] = [];
  const dirs = await readdir(PROMPTS_DIR, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(PROMPTS_DIR, dir.name);

    for (const file of await readdir(dirPath)) {
      const match = FILE_RE.exec(file);
      if (!match) continue;

      const filePath = path.join(dirPath, file);
      const text = normalize(await readFile(filePath, "utf8"));
      if (!text.trim()) throw new PromptIntegrityError(`Prompt file is empty: ${filePath}`);

      result.push({
        name: dir.name,
        version: Number(match[1]),
        text,
        contentHash: hashPromptText(text),
        filePath,
      });
    }
  }
  return result;
}

const cache = new Map<string, ActivePrompt>();

/** Call once at startup, after the DB connection is ready. Throws on any mismatch. */
export async function registerPrompts(): Promise<void> {
  cache.clear();
  const files = await readPromptFiles();
  if (files.length === 0) {
    throw new PromptIntegrityError(`No prompt files found in ${PROMPTS_DIR}`);
  }

  for (const f of files) {
    const existing = await PromptVersion.findOne({ name: f.name, version: f.version });

    if (!existing) {
      await PromptVersion.create({
        name: f.name,
        version: f.version,
        text: f.text,
        contentHash: f.contentHash,
        isActive: false,
      });
      console.log(`[prompts] registered ${f.name} v${f.version}`);
      continue;
    }

    if (existing.contentHash !== f.contentHash) {
      throw new PromptIntegrityError(
        `Prompt "${f.name}" v${f.version} was modified after registration.\n` +
          `  file:   ${f.filePath}\n` +
          `  stored: ${existing.contentHash}\n` +
          `  file's: ${f.contentHash}\n` +
          `Published versions are immutable. Put your change in a new version file (v${f.version + 1}.txt).`
      );
    }
  }

  // Highest version on disk becomes the active one, per prompt name.
  for (const name of new Set(files.map((f) => f.name))) {
    const latest = Math.max(...files.filter((f) => f.name === name).map((f) => f.version));
    await PromptVersion.updateOne({ name, version: latest }, { $set: { isActive: true } });
    await PromptVersion.updateMany({ name, version: { $ne: latest } }, { $set: { isActive: false } });
    console.log(`[prompts] active: ${name} v${latest}`);
  }
}

/** Returns the active prompt from the DB, re-verifying its hash. Cached in memory. */
export async function getActivePrompt(name = "system"): Promise<ActivePrompt> {
  const cached = cache.get(name);
  if (cached) return cached;

  const doc = await PromptVersion.findOne({ name, isActive: true }).sort({ version: -1 }).lean();
  if (!doc) throw new PromptIntegrityError(`No active prompt named "${name}". Was registerPrompts() run?`);

  if (hashPromptText(doc.text) !== doc.contentHash) {
    throw new PromptIntegrityError(`Stored text of "${name}" v${doc.version} does not match its hash (DB tampered?).`);
  }

  const active: ActivePrompt = { id: String(doc._id), name, version: doc.version, text: doc.text };
  cache.set(name, active);
  return active;
}