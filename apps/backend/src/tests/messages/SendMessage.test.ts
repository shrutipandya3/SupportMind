import { jest } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';
import { seedTestData, SESSION_A, SESSION_B, type SeedResult } from '../../utils/testUtils/testSeed.js';

/**
 * POST /api/chats/:id/messages
 *
 * Route: requireSession → validate(params + body) → sendMessage
 *
 * Key contracts tested:
 *  - requireSession fires BEFORE the controller: no session cookie → 401
 *  - The controller scopes Chat lookup to the session (findOne { _id, sessionId })
 *    so a valid chatId with the WRONG session cookie → 404
 *  - Streaming uses Server-Sent Events (SSE); wire format is:
 *      data: {"content":"..."}          ← unnamed chunk events
 *      event: done\ndata: {...}         ← terminal done event
 *      event: error\ndata: {...}        ← terminal error event (mid-stream failures)
 *  - CHUNK_DELAY_MS = 100, WORDS_PER_CHUNK = 2 (as in the controller)
 *  - speedUpStreaming() patches only 100ms timers so tests stay fast
 *
 * Seed data (from testSeed.ts):
 *  - SESSION_A owns: 'Refund request', 'Password reset help'
 *  - SESSION_B owns: 'Billing inquiry', 'New Chat'
 */

jest.setTimeout(20000);

const CHUNK_DELAY_MS = 100;
const WORDS_PER_CHUNK = 2;

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

// ─── SSE parsing helpers ──────────────────────────────────────────────────────

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
type DoneEvent  = { event: 'done';    data: DoneData  };
type ErrorEvent = { event: 'error';   data: ErrorData };
type ParsedSSE  = ChunkEvent | DoneEvent | ErrorEvent;

const isChunk = (e: ParsedSSE): e is ChunkEvent => e.event === undefined;
const isDone  = (e: ParsedSSE): e is DoneEvent  => e.event === 'done';
const isError = (e: ParsedSSE): e is ErrorEvent => e.event === 'error';

/** Parses a raw SSE payload into typed event objects. */
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

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('POST /api/chats/:id/messages', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await dbConnect();
    }
  });

  afterAll(async () => {
    await dbDisconnect();
  });

  beforeEach(async () => {
    await Chat.deleteMany({});
    await Message.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Session validation ─────────────────────────────────────────────────────

  describe('session validation', () => {
    it('returns 401 when no session cookie is sent (requireSession blocks the request)', async () => {
      const chatId = validObjectId();
      const findSpy  = jest.spyOn(Chat, 'findOne' as any);
      const createSpy = jest.spyOn(Message, 'create');

      // No .set('Cookie', ...) — request has no sid cookie
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session/i);
      expect(findSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns 401 when an invalid (non-UUID) sid cookie value is sent', async () => {
      const chatId = validObjectId();
      const findSpy = jest.spyOn(Chat, 'findOne' as any);

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', 'sid=not-a-valid-uuid')
        .send({ content: 'Hello' });

      expect(res.status).toBe(401);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('returns 404 when cookie sessionId does not match the chat (cross-session leak prevention)', async () => {
      // Chat belongs to SESSION_A but we send SESSION_B's cookie
      const { insertedId } = await Chat.collection.insertOne({
        title: 'A-only chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_B}`)   // wrong session
        .send({ content: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
      expect(await Message.countDocuments()).toBe(0);
    });
  });

  // ─── Params validation ──────────────────────────────────────────────────────

  describe('params validation (chat id)', () => {
    it.each([
      ['too short',           '123'],
      ['not a mongo id',      'not-a-mongo-id'],
      ['non-hex 24 chars',    'g'.repeat(24)],
      ['25 characters',       'a'.repeat(25)],
      ['23 characters',       'a'.repeat(23)],
      ['special characters',  'invalid-id-with-dashes!!'],
    ])('returns 400 when id is invalid (%s)', async (_label, badId) => {
      const findSpy   = jest.spyOn(Chat, 'findOne' as any);
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${badId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(400);
      expect(findSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });
  });

  // ─── Body validation ────────────────────────────────────────────────────────

  describe('body validation (content)', () => {
    let chatId: string;

    beforeEach(async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'Test chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      chatId = insertedId.toString();
    });

    const expectNothingSaved = async () => {
      expect(await Message.countDocuments()).toBe(0);
    };

    it('returns 400 when content is missing (empty body object)', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({});

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when only unrelated fields are sent', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it('returns 400 when content is an empty string', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
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
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content });

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when content exceeds 4000 characters', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'a'.repeat(4001) });

      expect(res.status).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
      await expectNothingSaved();
    });

    it('returns 400 when content is > 4000 chars even after trim', async () => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: `  ${'a'.repeat(4001)}  ` });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it.each([
      ['a number',  123],
      ['a boolean', true],
      ['an array',  ['hi']],
      ['null',      null],
    ])('returns 400 when content is %s (invalid type)', async (_label, content) => {
      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content });

      expect(res.status).toBe(400);
      await expectNothingSaved();
    });

    it('accepts content of exactly 4000 characters (boundary)', async () => {
      speedUpStreaming();

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'a'.repeat(4000) });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
    });

    it('accepts content of exactly 1 character (boundary)', async () => {
      speedUpStreaming();

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'a' });

      expect(res.status).toBe(200);
    });
  });

  // ─── Chat not found ─────────────────────────────────────────────────────────

  describe('chat not found', () => {
    it('returns 404 { message: "Chat not found" } and saves no user message', async () => {
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello?' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
      expect(createSpy).not.toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });

    it('does not open an SSE stream for a missing chat', async () => {
      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello?' });

      expect(res.headers['content-type']).not.toContain('text/event-stream');
    });
  });

  // ─── Archived chat ──────────────────────────────────────────────────────────

  describe('archived chat', () => {
    it('returns 409 and does not save a message when the chat is archived', async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'Old chat',
        sessionId: SESSION_A,
        status: 'archived',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(409);
      expect(createSpy).not.toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });
  });

  // ─── SSE streaming with seeded session data ──────────────────────────────────

  describe('SSE streaming — seeded chat with matching sessionId', () => {
    /**
     * This block uses testSeed.ts data. seedTestData() is called once in beforeAll
     * for this describe block (overriding the outer beforeEach cleanup for its own
     * lifecycle — each test here re-seeds fresh from this describe's beforeAll).
     *
     * Strategy: each test inserts its own seeded chat so it's isolated from the
     * outer beforeEach clear, and runs the request with the matching sid cookie.
     */
    let seedResult: SeedResult;

    beforeEach(async () => {
      speedUpStreaming();
      // Seed fresh data before each test in this block (outer beforeEach already cleared)
      seedResult = await seedTestData();
    });

    it('responds with correct SSE headers when sessionId matches the seeded chat', async () => {
      // Pick the first SESSION_A chat from seed data
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;
      expect(seededChat).toBeDefined();

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'I need help with my refund.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.headers['x-accel-buffering']).toBe('no');
    });

    it('saves the user message in the seeded chat before streaming begins', async () => {
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;
      const writeSpy  = jest.spyOn(http.ServerResponse.prototype, 'write');
      const createSpy = jest.spyOn(Message, 'create');

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: '   Please check my invoice.   ' });

      expect(res.status).toBe(200);

      // 1st create call must be the user message (trimmed)
      const userArgs: unknown = createSpy.mock.calls[0]?.[0];
      expect(userArgs).toMatchObject({ role: 'user', content: 'Please check my invoice.' });

      // create happened before the first SSE write
      const firstCreateOrder = createSpy.mock.invocationCallOrder[0]!;
      const firstWriteOrder  = writeSpy.mock.invocationCallOrder[0]!;
      expect(firstCreateOrder).toBeLessThan(firstWriteOrder);

      // user message persisted in DB
      const userMsg = await Message.findOne({ chatId: seededChat._id, role: 'user', content: 'Please check my invoice.' });
      expect(userMsg).not.toBeNull();
    });

    it('streams chunks in `data: {"content":"..."} format for a seeded SESSION_A chat', async () => {
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(200);

      // First chunk wire format
      expect(res.text.startsWith('data: {"content":"This is "}\n\n')).toBe(true);

      const events  = parseSSE(res.text);
      const chunks  = contentChunks(events);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(typeof chunk).toBe('string');
        expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(WORDS_PER_CHUNK);
      });

      // Re-joining chunks reconstructs the static answer
      const joined = chunks.join('');
      expect(joined.startsWith('This is a static answer')).toBe(true);
      expect(joined).toContain('\n');
    });

    it('emits a terminal `event: done` with the saved assistant message and chat for SESSION_A', async () => {
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.text.endsWith('\n\n')).toBe(true);

      const events = parseSSE(res.text);
      const last   = events[events.length - 1]!;

      expect(last.event).toBe('done');
      expect(events.filter(isDone)).toHaveLength(1);
      expect(events.some(isError)).toBe(false);

      const done   = events.find(isDone)!;
      const joined = contentChunks(events).join('');

      expect(done.data.message).toEqual(
        expect.objectContaining({
          _id:    expect.any(String),
          chatId: seededChat._id.toString(),
          role:   'assistant',
          content: joined,
        })
      );
      expect(done.data.chat).toEqual(
        expect.objectContaining({ _id: seededChat._id.toString(), title: expect.any(String) })
      );
    });

    it('saves the complete assistant message and chat message count is correct', async () => {
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      const events  = parseSSE(res.text);
      const joined  = contentChunks(events).join('');
      const chatId  = seededChat._id;

      const assistantMsgs = await Message.find({ chatId, role: 'assistant' });
      expect(assistantMsgs).toHaveLength(1);
      expect(assistantMsgs[0]?.content).toBe(joined);
      expect(assistantMsgs[0]?.status).toBe('complete');

      const done = events.find(isDone)!;
      expect(done.data.message._id).toBe(assistantMsgs[0]?._id.toString());

      // Seed had 2 messages for this chat; now +2 (new user + assistant) = 4
      const totalMessages = await Message.countDocuments({ chatId });
      expect(totalMessages).toBe(4); // 2 from seed + 1 user + 1 assistant
    });

    it('works the same for a SESSION_B seeded chat', async () => {
      const seededChat = seedResult.chats.find((c) => c.sessionId === SESSION_B)!;
      expect(seededChat).toBeDefined();

      const res = await request(app)
        .post(`/api/chats/${seededChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_B}`)
        .send({ content: 'I have a billing question.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSSE(res.text);
      expect(events.find(isDone)).toBeDefined();
      expect(events.some(isError)).toBe(false);

      const assistantMsg = await Message.findOne({ chatId: seededChat._id, role: 'assistant' });
      expect(assistantMsg).not.toBeNull();
      expect(assistantMsg?.content).toBeTruthy();
    });

    it('does not let SESSION_A access a chat that belongs to SESSION_B', async () => {
      const sessionBChat = seedResult.chats.find((c) => c.sessionId === SESSION_B)!;

      const res = await request(app)
        .post(`/api/chats/${sessionBChat._id.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)   // wrong session
        .send({ content: 'Hello' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });

      // No new messages saved
      const newMessages = await Message.find({ chatId: sessionBChat._id, role: 'user', content: 'Hello' });
      expect(newMessages).toHaveLength(0);
    });
  });

  // ─── Errors BEFORE the stream starts ────────────────────────────────────────

  describe('error handling before headers are sent', () => {
    it('returns 500 JSON when Chat.findOne throws an Error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findOne' as any)
        .mockImplementation(() => { throw new Error('Database connection lost'); });

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error:   'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
      expect(await Message.countDocuments()).toBe(0);
    });

    it('returns 500 JSON when the initial Message.create (user message) throws', async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New Chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Message, 'create')
        .mockImplementation(() => { throw new Error('Insert failed'); });

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error:   'Insert failed',
      });
      expect(errorSpy).toHaveBeenCalled();

      jest.restoreAllMocks();
      expect(await Message.countDocuments()).toBe(0);
    });

    it("falls back to 'Unknown error' when a non-Error is thrown before headers", async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findOne' as any)
        .mockImplementation(() => { throw 'something went wrong'; });

      const res = await request(app)
        .post(`/api/chats/${validObjectId()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to send message',
        error:   'Unknown error',
      });
    });
  });

  // ─── Auto-title ─────────────────────────────────────────────────────────────

  describe('auto-title', () => {
    beforeEach(() => {
      speedUpStreaming();
    });

    it("sets title to first 20 chars of trimmed content on the first message when title is the default", async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New chat',  // matches DEFAULT_CHAT_TITLE in the controller
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: '   Hello world, this is a long first question   ' });

      expect(res.status).toBe(200);

      const inDb = await Chat.findById(insertedId);
      expect(inDb?.title).toBe('Hello world, this is');
      expect(inDb?.title.length).toBeLessThanOrEqual(20);

      const done = parseSSE(res.text).find(isDone);
      expect(done?.data.chat.title).toBe('Hello world, this is');
    });

    it('trims trailing whitespace from the auto-generated title', async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // slice(0,20) ends with a space → must be trimmed
      await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello world this is a long question' });

      const inDb = await Chat.findById(insertedId);
      expect(inDb?.title).toBe('Hello world this is');
    });

    it('does not overwrite a custom title on the first message', async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'My Custom Title',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Some brand new question' });

      expect(res.status).toBe(200);
      expect((await Chat.findById(insertedId))?.title).toBe('My Custom Title');

      const done = parseSSE(res.text).find(isDone);
      expect(done?.data.chat.title).toBe('My Custom Title');
    });

    it("does not update the title when the chat already has messages (even if title is still default)", async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Insert a prior message so hasMessages = true
      await Message.collection.insertOne({
        chatId: insertedId,
        role: 'user',
        content: 'Earlier message',
        status: 'complete',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'A follow-up question' });

      expect((await Chat.findById(insertedId))?.title).toBe('New chat');
    });
  });

  // ─── Client disconnect mid-stream ───────────────────────────────────────────

  describe('client disconnect mid-stream', () => {
    it('aborts the loop early and does not persist the assistant message', async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New Chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const writeSpy = jest.spyOn(http.ServerResponse.prototype, 'write');

      // Start a real HTTP server on a random port (real timers — no speedUpStreaming here)
      const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
      const { port } = server.address() as AddressInfo;

      try {
        await new Promise<void>((resolve) => {
          const req = http.request(
            {
              port,
              path: `/api/chats/${insertedId.toString()}/messages`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Cookie: `sid=${SESSION_A}`,
              },
            },
            (res) => {
              res.on('error', () => {});
              res.once('data', () => {
                req.destroy(); // triggers 'close' on the server side before writableEnded
                resolve();
              });
            }
          );
          req.on('error', () => {});
          req.write(JSON.stringify({ content: 'Hello' }));
          req.end();
        });

        // Wait longer than the full stream would take if it had NOT aborted
        await sleep(2500);

        // Loop stopped early (full run would write ~18 chunks + done)
        expect(writeSpy.mock.calls.length).toBeLessThan(5);

        // User message saved, assistant NOT saved
        expect(await Message.countDocuments({ chatId: insertedId, role: 'user' })).toBe(1);
        expect(await Message.countDocuments({ chatId: insertedId, role: 'assistant' })).toBe(0);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  // ─── Errors AFTER the stream started ────────────────────────────────────────

  describe('error handling after headers are sent', () => {
    /** First Message.create (user message) runs normally; the second (assistant) fails. */
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
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New Chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const errorSpy  = jest.spyOn(console, 'error').mockImplementation(() => {});
      const statusSpy = jest.spyOn(express.response, 'status');
      const jsonSpy   = jest.spyOn(express.response, 'json');
      failOnAssistantSave(new Error('Assistant save failed'));

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      // Headers were already sent as 200/SSE — no status change or JSON body
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(statusSpy).not.toHaveBeenCalledWith(500);
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      // Exact wire format of the error event
      expect(res.text).toContain(
        'event: error\ndata: {"message":"Failed to send message","error":"Assistant save failed"}\n\n'
      );

      const events = parseSSE(res.text);
      const last   = events[events.length - 1]!;
      expect(last.event).toBe('error');
      expect(last.data).toEqual({
        message: 'Failed to send message',
        error:   'Assistant save failed',
      });
      expect(events.some(isDone)).toBe(false);
      expect(contentChunks(events).length).toBeGreaterThan(1);

      jest.restoreAllMocks();
      expect(await Message.countDocuments({ chatId: insertedId, role: 'assistant' })).toBe(0);
    });

    it("uses 'Unknown error' in the SSE error event when a non-Error is thrown mid-stream", async () => {
      const { insertedId } = await Chat.collection.insertOne({
        title: 'New Chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      failOnAssistantSave('boom');

      const res = await request(app)
        .post(`/api/chats/${insertedId.toString()}/messages`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ content: 'Hello' });

      expect(res.status).toBe(200);

      const events = parseSSE(res.text);
      const last   = events[events.length - 1]!;
      expect(last.event).toBe('error');
      expect(last.data).toEqual({
        message: 'Failed to send message',
        error:   'Unknown error',
      });
    });
  });
});