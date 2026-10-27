import type { NextFunction, Request, Response } from 'express';
import { Message, type IMessage } from '../db/models/Message.js';
import { Chat, type IChat } from '../db/models/Chat.js';
import type { SendMessageBody, SendMessageParams } from '../schemas/messageSchema.js';
import { createHttpError } from '../middleware/errorHandler.js';

const STATIC_ANSWER = `This is a static answer streamed back to you word by word.
It simulates how a real AI model would respond over time.
Replace this constant with a real model call when you are ready.`;

const WORDS_PER_CHUNK = 2;
const CHUNK_DELAY_MS = 100;
const AUTO_TITLE_LENGTH = 20;
const DEFAULT_CHAT_TITLE = 'New Chat';

export interface MessageDoneEvent {
  message: IMessage;
  chat: IChat;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Splits text into tokens of "word + trailing whitespace" so that
 * line breaks and spacing are preserved when the chunks are joined.
 */
const splitIntoChunks = (text: string, wordsPerChunk: number): string[] => {
  const tokens = text.match(/\S+\s*/g) ?? [];
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += wordsPerChunk) {
    chunks.push(tokens.slice(i, i + wordsPerChunk).join(''));
  }
  return chunks;
};

const writeSSE = (res: Response, data: unknown, event?: string): void => {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * POST /api/chats/:id/messages
 * Saves the user message, streams a static assistant answer via SSE,
 * saves the full assistant message when streaming finishes,
 * and auto-titles the chat from the first question.
 *
 * Errors BEFORE the stream opens go to errorHandler via next(error).
 * Errors AFTER the stream opens are sent as an SSE 'error' event,
 * because the status code can no longer be changed.
 */
export const sendMessage = async (
  req: Request<SendMessageParams, unknown, SendMessageBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Set to true if the client disconnects before we finish streaming
  let clientDisconnected = false;

  try {
    const { id } = req.params;
    const { content } = req.body;

    // 1. Check the chat exists before saving anything
    const chat = await Chat.findById(id);
    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    // 2. Is this the first message in the chat? (must run BEFORE saving the user message)
    const hasMessages = await Message.exists({ chatId: chat._id });

    // 3. Save the user message
    await Message.create({
      chatId: chat._id,
      role: 'user',
      content,
    });

    // 4. Auto-title on first message (only if the title is still the default)
    if (!hasMessages && chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = content.trim().slice(0, AUTO_TITLE_LENGTH).trim();
      await chat.save();
    }

    // 5. Open the SSE stream
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
    res.flushHeaders();

    // Detect disconnects: 'close' fires when the connection ends;
    // if we haven't finished writing by then, the client left early.
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    // 6. Stream the static answer, a few words at a time
    const chunks = splitIntoChunks(STATIC_ANSWER, WORDS_PER_CHUNK);
    for (const chunk of chunks) {
      if (clientDisconnected) {
        return; // disconnected: do not save the assistant message
      }
      writeSSE(res, { content: chunk });
      await sleep(CHUNK_DELAY_MS);
    }

    if (clientDisconnected) {
      return; // disconnected during the last delay: do not save
    }

    // 7. Streaming finished: save the full assistant message
    const assistantMessage = await Message.create({
      chatId: chat._id,
      role: 'assistant',
      content: STATIC_ANSWER,
    });

    // 8. Tell the client we're done, including the saved message and the (possibly new) title
    const doneEvent: MessageDoneEvent = {
      message: assistantMessage,
      chat,
    };
    writeSSE(res, doneEvent, 'done');
    res.end();
  } catch (error) {
    if (res.headersSent) {
      // Stream already open: log it and emit an SSE error event (no internal details)
      console.error('Error while streaming message:', error);
      if (!res.writableEnded && !clientDisconnected) {
        writeSSE(res, { message: 'Failed to send message' }, 'error');
        res.end();
      }
      return;
    }

    // Stream not opened yet: let the global errorHandler respond
    next(error);
  }
};