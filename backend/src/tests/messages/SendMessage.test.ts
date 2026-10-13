import { jest } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';
import app from '../../app.js';

const TEST_DB_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/test_db';

/**
 * NOTE: these tests assume:
 *
 *  - route: POST /api/chats/:id/messages
 *      validate({ params: sendMessageParamsSchema, body: sendMessageBodySchema })
 *      runs BEFORE the controller, and the validate middleware writes the
 *      parsed (trimmed) body back to req.body. If it does not, the
 *      "stores trimmed content" test will fail, which is a real finding.
 *  - Chat model defaults `title` to 'New Chat' (we pass it explicitly anyway)
 *  - CHUNK_DELAY_MS is 100 and WORDS_PER_CHUNK is 2 (as in the controller).
 *    `speedUpStreaming()` shortens only 100ms timers so tests don't take ~2s each.
 *  - Import paths for Chat / Message / app may need adjusting to your layout.
 */

jest.setTimeout(20000);

const CHUNK_DELAY_MS = 100;
const WORDS_PER_CHUNK = 2;
const DEFAULT_CHAT_TITLE = 'New Chat';

const validObjectId = () => new mongoose.Types.ObjectId().toString();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Make the controller's 100ms inter-chunk delay ~instant (other timers untouched). */
const speedUpStreaming = () => {
  const realSetTimeout = global.setTimeout;
  jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((handler: () => void, ms?: number) =>
      realSetTimeout(handler, ms === CHUNK_DELAY_MS ? 0 : ms)) as unknown as typeof setTimeout);
};

interface ChunkData {
  content: string;
}

interface ErrorData {
  message: string;
  error: string;
}

interface DoneData {
  message: { _id: string; chatId: string; role: string; content: string };
  chat: { _id: string; title: string };
}

type ChunkEvent = { event: undefined; data: ChunkData };
type DoneEvent = { event: 'done'; data: DoneData };
type ErrorEvent = { event: 'error'; data: ErrorData };
type ParsedSSE = ChunkEvent | DoneEvent | ErrorEvent;

const isChunk = (e: ParsedSSE): e is ChunkEvent => e.event === undefined;
const isDone = (e: ParsedSSE): e is DoneEvent => e.event === 'done';
const isError = (e: ParsedSSE): e is ErrorEvent => e.event === 'error';

/** Parses a raw SSE payload into [{ event?, data }] blocks. */
const parseSSE = (raw: string): ParsedSSE[] =>
  raw
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event: string | undefined;
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice('event: '.length);
        else if (line.startsWith('data: ')) data += line.slice('data: '.length);
      }
      const parsed: unknown = JSON.parse(data);
      return { event, data: parsed } as ParsedSSE;
    });

const contentChunks = (events: ParsedSSE[]): string[] =>
  events.filter(isChunk).map((e) => e.data.content);

describe('POST /api/chats/:id/messages', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Chat.deleteMany({});
    await Message.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  describe('params validation (id)', () => {
    it.each([
      ['too short', '123'],
      ['not a mongo id', 'not-a-mongo-id'],
      ['not hex characters', 'g'.repeat(24)],
      ['25 characters', 'a'.repeat(25)],
      ['23 characters', 'a'.repeat(23)],
      ['special characters', 'invalid-id-with-dashes!!'],
    ])('returns 400 when id is invalid (%s)', async (_label, badId) => {
      const findSpy = jest.spyOn(Chat, 'findById');
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${badId}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(400);
      expect(findSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });
  });

  describe('body validation (content)', () => {
    let chatId: string;

    beforeEach(async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      chatId = chat._id.toString();
    });

    const expectNothingSaved = async () => {
      expect(await Message.countDocuments()).toBe(0);
      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe(DEFAULT_CHAT_TITLE);
    };

    it('returns 400 when content is missing (empty body object)', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app).post(`/api/chats/${chatId}/messages`).send({});

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when only unrelated fields are sent', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it('returns 400 when content is an empty string', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it.each([
      ['a single space', ' '],
      ['multiple spaces', '     '],
      ['tabs and newlines', '\t\n  \r\n'],
    ])('returns 400 for whitespace-only content (%s)', async (_label, content) => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content });

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when content exceeds 4000 characters', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'a'.repeat(4001) });

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when content is > 4000 chars even after trim', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: `  ${'a'.repeat(4001)}  ` });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it.each([
      ['a number', 123],
      ['a boolean', true],
      ['an object', {}],
      ['an array', ['hi']],
      ['null', null],
    ])('returns 400 when content is %s (invalid type)', async (_label, content) => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it('accepts content of exactly 4000 characters (boundary)', async () => {
      speedUpStreaming();

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'a'.repeat(4000) });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
    });

    it('accepts content of exactly 1 character (boundary)', async () => {
      speedUpStreaming();

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'a' });

      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Chat lookup
  // ---------------------------------------------------------------------------
  describe('chat not found', () => {
    it('returns 404 { message: "Chat not found" } and saves no user message', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .send({ content: 'Hello?' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
      expect(createSpy).not.toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });

    it('does not open an SSE stream for a missing chat', async () => {
      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .send({ content: 'Hello?' });

      expect(res.headers['content-type']).not.toContain('text/event-stream');
    });
  });

  // ---------------------------------------------------------------------------
  // Errors BEFORE the stream starts
  // ---------------------------------------------------------------------------
  describe('error handling before headers are sent', () => {
    it('returns 500 JSON when Chat.findById throws an Error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findById')
        .mockImplementation(() => {
          throw new Error('Database connection lost');
        });

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error: 'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });

    it('returns 500 JSON when the initial Message.create (user message) throws', async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Message, 'create')
        .mockImplementation(() => {
          throw new Error('Insert failed');
        });

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error: 'Insert failed',
      });
      expect(errorSpy).toHaveBeenCalled();

      jest.restoreAllMocks();
      expect(await Message.countDocuments()).toBe(0);
      // title must not be touched because the failure happened before the auto-title step
      expect((await Chat.findById(chat._id))?.title).toBe(DEFAULT_CHAT_TITLE);
    });

    it("falls back to 'Unknown error' when a non-Error is thrown", async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findById')
        .mockImplementation(() => {
          throw 'something went wrong';
        });

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error: 'Unknown error',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-title
  // ---------------------------------------------------------------------------
  describe('auto-title', () => {
    beforeEach(() => {
      speedUpStreaming();
    });

    it("sets the title to the first 20 chars of the trimmed content when it's the first message and title is 'New Chat'", async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: '   Hello world, this is a long first question   ' });

      expect(res.status).toBe(200);

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Hello world, this is');
      expect(inDb?.title.length).toBeLessThanOrEqual(20);

      // the done event carries the updated title
      const done = parseSSE(res.text).find(isDone);
      expect(done?.data.chat.title).toBe('Hello world, this is');
    });

    it('trims trailing whitespace left over after truncation', async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });

      // slice(0, 20) ends with a space -> must be trimmed again
      await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'Hello world this is a long question' });

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Hello world this is');
    });

    it('uses the whole content as the title when it is shorter than 20 chars', async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });

      await request(app).post(`/api/chats/${chat._id}/messages`).send({ content: '  Hi  ' });

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Hi');
    });

    it("does not overwrite the title on the first message when it is not 'New Chat'", async () => {
      const chat = await Chat.create({ title: 'My Custom Title' });

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'Some brand new question' });

      expect(res.status).toBe(200);
      expect((await Chat.findById(chat._id))?.title).toBe('My Custom Title');

      const done = parseSSE(res.text).find(isDone);
      expect(done?.data.chat.title).toBe('My Custom Title');
    });

    it("does not update the title when the chat already has messages, even if it is still 'New Chat'", async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      await Message.create({ chatId: chat._id, role: 'user', content: 'Earlier message' });

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'A follow-up question' });

      expect(res.status).toBe(200);
      expect((await Chat.findById(chat._id))?.title).toBe(DEFAULT_CHAT_TITLE);
    });
  });

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------
  describe('SSE streaming (happy path)', () => {
    let chatId: string;

    beforeEach(async () => {
      speedUpStreaming();
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      chatId = chat._id.toString();
    });

    it('responds with the correct SSE headers', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.headers['x-accel-buffering']).toBe('no');
    });

    it("saves the user message with role 'user' and trimmed content BEFORE any chunk is streamed", async () => {
      const writeSpy = jest.spyOn(http.ServerResponse.prototype, 'write');
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: '   What is the weather?   ' });

      expect(res.status).toBe(200);

      // 1st Message.create call is the user message
      const userArgs: unknown = createSpy.mock.calls[0]?.[0];
      expect(userArgs).toMatchObject({ role: 'user', content: 'What is the weather?' });

      // ...and it happened before the first SSE write
      const firstCreateOrder = createSpy.mock.invocationCallOrder[0]!;
      const firstWriteOrder = writeSpy.mock.invocationCallOrder[0]!;
      expect(firstCreateOrder).toBeLessThan(firstWriteOrder);

      const userMsg = await Message.findOne({ chatId, role: 'user' });
      expect(userMsg).not.toBeNull();
      expect(userMsg?.content).toBe('What is the weather?');
    });

    it('streams word chunks formatted as `data: {"content":"..."}\\n\\n`', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'Hello' });

      // exact wire format of the first chunk (WORDS_PER_CHUNK = 2)
      expect(res.text.startsWith('data: {"content":"This is "}\n\n')).toBe(true);

      const events = parseSSE(res.text);
      const chunks = contentChunks(events);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(typeof chunk).toBe('string');
        expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(WORDS_PER_CHUNK);
      });

      // whitespace/newlines are preserved when chunks are re-joined
      const joined = chunks.join('');
      expect(joined.startsWith('This is a static answer')).toBe(true);
      expect(joined).toContain('\n');
    });

    it("emits a terminal `event: done` with the full assistant message and the chat, then closes", async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'Hello' });

      // supertest only resolves once res.end() has been called by the server
      expect(res.status).toBe(200);
      expect(res.text.endsWith('\n\n')).toBe(true);

      const events = parseSSE(res.text);
      const last = events[events.length - 1]!;
      expect(last.event).toBe('done');
      expect(events.filter(isDone)).toHaveLength(1);
      expect(events.some(isError)).toBe(false);

      const done = events.find(isDone);
      const joined = contentChunks(events).join('');
      expect(done?.data.message).toEqual(
        expect.objectContaining({
          _id: expect.any(String),
          chatId,
          role: 'assistant',
          content: joined,
        })
      );
      expect(done?.data.chat).toEqual(
        expect.objectContaining({ _id: chatId, title: expect.any(String) })
      );
    });

    it("saves the complete assistant message with role 'assistant'", async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'Hello' });

      const events = parseSSE(res.text);
      const joined = contentChunks(events).join('');

      const assistantMsgs = await Message.find({ chatId, role: 'assistant' });
      expect(assistantMsgs).toHaveLength(1);
      expect(assistantMsgs[0]?.content).toBe(joined);

      const done = events.find(isDone);
      expect(done?.data.message._id).toBe(assistantMsgs[0]?._id.toString());

      // exactly one user + one assistant message in total
      expect(await Message.countDocuments({ chatId })).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Client disconnect
  // ---------------------------------------------------------------------------
  describe('client disconnect mid-stream', () => {
    it('aborts the loop early and does not persist the assistant message', async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      const writeSpy = jest.spyOn(http.ServerResponse.prototype, 'write');

      // real (slow) timers here: the full stream would take ~1.8s
      const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
      const { port } = server.address() as AddressInfo;

      try {
        // Open the stream, wait for the first chunk, then drop the connection.
        await new Promise<void>((resolve) => {
          const req = http.request(
            {
              port,
              path: `/api/chats/${chat._id}/messages`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            },
            (res) => {
              res.on('error', () => {});
              res.once('data', () => {
                req.destroy(); // -> server-side res emits 'close' before writableEnded
                resolve();
              });
            }
          );
          req.on('error', () => {});
          req.write(JSON.stringify({ content: 'Hello' }));
          req.end();
        });

        // Wait longer than the whole stream would take if it had NOT aborted.
        await sleep(2500);

        // The loop stopped early (a full run would write ~18 chunks + done event)
        expect(writeSpy.mock.calls.length).toBeLessThan(5);

        // User message saved, assistant message NOT saved
        expect(await Message.countDocuments({ chatId: chat._id, role: 'user' })).toBe(1);
        expect(await Message.countDocuments({ chatId: chat._id, role: 'assistant' })).toBe(0);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Errors AFTER the stream started
  // ---------------------------------------------------------------------------
  describe('error handling after headers are sent', () => {
    /** First Message.create (user message) really runs; the second (assistant) fails. */
    const failOnAssistantSave = (rejection: unknown) => {
      const original = Message.create.bind(Message) as unknown as (
        ...args: unknown[]
      ) => Promise<unknown>;
      let calls = 0;
      return jest.spyOn(Message, 'create').mockImplementation(((...args: unknown[]) => {
        calls += 1;
        return calls === 1 ? original(...args) : Promise.reject(rejection);
      }) as unknown as typeof Message.create);
    };

    beforeEach(() => {
      speedUpStreaming();
    });

    it('emits an SSE `error` event and ends the stream without sending a 500 JSON', async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const statusSpy = jest.spyOn(express.response, 'status');
      const jsonSpy = jest.spyOn(express.response, 'json');
      failOnAssistantSave(new Error('Assistant save failed'));

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'Hello' });

      // headers were already sent as 200 / SSE, so no status change or JSON body
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(statusSpy).not.toHaveBeenCalledWith(500);
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      // exact wire format of the error event
      expect(res.text).toContain(
        'event: error\ndata: {"message":"Failed to send message","error":"Assistant save failed"}\n\n'
      );

      const events = parseSSE(res.text);
      const last = events[events.length - 1]!;
      expect(last.event).toBe('error');
      expect(last.data).toEqual({
        message: 'Failed to send message',
        error: 'Assistant save failed',
      });
      expect(events.some(isDone)).toBe(false);

      // the content chunks were streamed before the failure
      expect(contentChunks(events).length).toBeGreaterThan(1);

      // assistant message was not persisted
      jest.restoreAllMocks();
      expect(await Message.countDocuments({ chatId: chat._id, role: 'assistant' })).toBe(0);
    });

    it("uses 'Unknown error' in the SSE error event when a non-Error is thrown", async () => {
      const chat = await Chat.create({ title: DEFAULT_CHAT_TITLE });
      // DEBUG: is the chat really in the DB before the request?
      expect(await Chat.findById(chat._id)).not.toBeNull();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      failOnAssistantSave('boom');

      const res = await request(app)
        .post(`/api/chats/${chat._id}/messages`)
        .send({ content: 'Hello' });

      // DEBUG: controller 404 ({"message":"Chat not found"}) or Express "Cannot POST"?
      console.log('DEBUG', res.status, res.headers['content-type'], res.text);

      expect(res.status).toBe(200);

      const events = parseSSE(res.text);
      const last = events[events.length - 1]!;
      expect(last.event).toBe('error');
      expect(last.data).toEqual({
        message: 'Failed to send message',
        error: 'Unknown error',
      });
    });
  });
});