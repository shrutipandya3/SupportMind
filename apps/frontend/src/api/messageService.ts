import type { Chat, Message } from './chatService';
import type { SendMessageBody, SendMessageParams } from '../schemas/messageSchema';
import { BASE_URL } from './apiClient';

export interface SendMessageInput extends SendMessageParams, SendMessageBody {}

/** Payload of the SSE 'done' event (mirrors MessageDoneEvent in the controller) */
export interface MessageDoneEvent {
  message: Message;
  chat: Chat;
}

export interface SendMessageHandlers {
  /** Called once the server has accepted the request and opened the stream */
  onOpen?: () => void;
  /** Called for every streamed piece of the assistant reply */
  onChunk: (content: string) => void;
}

interface ChunkData {
  content: string;
}

interface ErrorData {
  message: string;
}

interface ParsedSSEEvent {
  event: string;
  data: unknown;
}

/** Parses one raw SSE block ("event: x\ndata: {...}") */
const parseSSEEvent = (raw: string): ParsedSSEEvent | null => {
  let event = 'message'; // SSE default event name
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: JSON.parse(dataLines.join('\n')) };
};

/** Reads { message } from an errorHandler JSON response, with a safe fallback */
const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
};

/**
 * POST /chats/:id/messages - saves the user message and streams the assistant reply.
 * Uses fetch (not axios) because axios cannot stream response bodies in the browser,
 * and EventSource only supports GET.
 * Resolves with the 'done' event; rejects with an Error on any failure.
 */
export const sendMessage = async (
  { id, content }: SendMessageInput,
  { onOpen, onChunk }: SendMessageHandlers
): Promise<MessageDoneEvent> => {
  const response = await fetch(`${BASE_URL}/chats/${id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ content }),
  });

  // Errors before the stream opens come from errorHandler as { status, message }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  if (!response.body) {
    throw new Error('Streaming is not supported in this browser');
  }

  onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent: MessageDoneEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line; keep any partial event in the buffer
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const parsed = parseSSEEvent(block);
      if (!parsed) continue;

      if (parsed.event === 'done') {
        doneEvent = parsed.data as MessageDoneEvent;
      } else if (parsed.event === 'error') {
        throw new Error((parsed.data as ErrorData).message);
      } else {
        onChunk((parsed.data as ChunkData).content);
      }
    }
  }

  if (!doneEvent) {
    throw new Error('The connection closed before the reply was complete');
  }

  return doneEvent;
};