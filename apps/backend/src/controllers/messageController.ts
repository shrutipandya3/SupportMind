import type { NextFunction, Request, Response } from 'express';
import {
  Message,
  type IMessage,
  type IMessageObject,
  type MessageStatus,
} from '../db/models/Message.js';
import { Chat, type IChatObject } from '../db/models/Chat.js';
import type { SendMessageBody, SendMessageParams } from '../schemas/messageSchema.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { getSessionId } from '../middleware/session.js';
import type { HydratedDocument } from 'mongoose';

const STATIC_ANSWER = `This is a static answer streamed back to you word by word.
It simulates how a real AI model would respond over time.
Replace this constant with a real model call when you are ready.`;

const WORDS_PER_CHUNK = 2;
const CHUNK_DELAY_MS = 100;
const AUTO_TITLE_LENGTH = 20;
const DEFAULT_CHAT_TITLE = 'New chat'; // must match the Chat model default

export interface MessageDoneEvent {
  message: IMessageObject;
  chat: IChatObject;
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
 * saves the assistant message (complete, stopped, or error) and
 * auto-titles the chat from the first question.
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

  // Tracked outside the try so the catch block can persist partial output
  let chatId: IChatObject['_id'] | undefined;
  let streamedContent = '';
  let assistantSaved = false;

  /**
   * Saves the assistant message. `content` is required by the model, so an
   * empty message (nothing streamed yet) cannot be stored and is skipped.
   */
  const saveAssistantMessage = async (
    status: MessageStatus,
    errorMessage?: string
  ): Promise<HydratedDocument<IMessage> | null> => {
    if (!chatId || !streamedContent || assistantSaved) return null;

    const message = await Message.create({
      chatId,
      role: 'assistant',
      content: streamedContent,
      status,
      replyType: 'canned', // switch to 'llm' once a real model is wired in
      // Spread only when defined (exactOptionalPropertyTypes forbids `undefined`)
      ...(errorMessage !== undefined && { errorMessage }),
    });

    assistantSaved = true;
    return message;
  };

  try {
    const { id } = req.params;
    const { content } = req.body;
    const sessionId = getSessionId(req);

    // 1. Load the chat, scoped to this session
    const chat = await Chat.findOne({ _id: id, sessionId });
    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    // 2. Archived chats are read-only
    if (chat.status === 'archived') {
      next(createHttpError(409, 'Chat is archived'));
      return;
    }

    chatId = chat._id;

    // 3. Is this the first message? (must run BEFORE saving the user message)
    const hasMessages = await Message.exists({ chatId: chat._id });

    // 4. Save the user message
    await Message.create({
      chatId: chat._id,
      role: 'user',
      content,
      status: 'complete',
    });

    // 5. Auto-title on first message (only if the title is still the default)
    //    and bump updatedAt so the chat list (sorted by updatedAt) stays current
    if (!hasMessages && chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = content.trim().slice(0, AUTO_TITLE_LENGTH).trim();
    }
    chat.updatedAt = new Date();
    await chat.save();

    // 6. Open the SSE stream
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
    res.flushHeaders();

    // 'close' fires when the connection ends; if we haven't finished writing
    // by then, the client left early.
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    // 7. Stream the static answer, a few words at a time
    const chunks = splitIntoChunks(STATIC_ANSWER, WORDS_PER_CHUNK);
    for (const chunk of chunks) {
      if (clientDisconnected) break;
      writeSSE(res, { content: chunk });
      streamedContent += chunk;
      await sleep(CHUNK_DELAY_MS);
    }

    // 8. Client left early: keep what was streamed, marked as 'stopped'
    if (clientDisconnected) {
      await saveAssistantMessage('stopped');
      return;
    }

    // 9. Streaming finished: save the full assistant message
    const assistantMessage = await saveAssistantMessage('complete');
    if (!assistantMessage) {
      throw new Error('Assistant message was empty');
    }

    chat.updatedAt = new Date();
    await chat.save();

    // 10. Tell the client we're done, with the saved message and the (possibly new) title
    const doneEvent: MessageDoneEvent = {
      message: assistantMessage.toObject() as IMessageObject,
      chat: chat.toObject() as IChatObject,
    };
    writeSSE(res, doneEvent, 'done');
    res.end();
  } catch (error) {
    if (res.headersSent) {
      // Stream already open: log it, keep any partial output, emit an SSE error event
      console.error('Error while streaming message:', error);

      try {
        await saveAssistantMessage('error', 'Failed to generate response');
      } catch (saveError) {
        console.error('Failed to persist partial assistant message:', saveError);
      }

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