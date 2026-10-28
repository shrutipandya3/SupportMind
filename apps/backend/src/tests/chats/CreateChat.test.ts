import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';

/**
 * POST /api/chats
 *
 * Schema contract assumed by these tests:
 *
 *   export const createChatSchema = z.object({
 *     title: z.string().trim()
 *       .min(1, 'Title cannot be empty')
 *       .max(100, 'Title cannot exceed 100 characters')
 *       .optional()
 *       .default('New Chat'),
 *   });
 *
 * - Missing / omitted title  → defaults to 'New Chat', responds 201
 * - sessionId is NOT from the client; it is set by ensureSession middleware
 *   and is therefore always present in the created document
 * - Each call gets its own session cookie (via supertest agent) or the same
 *   cookie when reused, so sessionId behaviour is tested both ways
 *
 * NOTE: Data is NOT cleared after all tests — the seeded chats and messages
 * are intentionally left for subsequent test files (e.g. GetChats, GetChatById).
 */

describe('POST /api/chats', () => {
  beforeAll(async () => await dbConnect());

  afterAll(async () => {
    // ✅ intentionally NOT calling Chat.deleteMany / dbDisconnect here so the
    //    data created in this file can be consumed by the next test file.
    await dbDisconnect();
  });

  beforeEach(async () => {
    // Start every test with a clean slate
    await Message.deleteMany({});
    await Chat.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  describe('validation', () => {
    it('returns 400 when title is an empty string (min(1) violation)', async () => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      const res = await request(app).post('/api/chats').send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('returns 400 when title exceeds 100 characters', async () => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      const res = await request(app)
        .post('/api/chats')
        .send({ title: 'a'.repeat(101) });

      expect(res.status).toBe(400);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('accepts a title of exactly 100 characters (boundary)', async () => {
      const title = 'a'.repeat(100);
      const res = await request(app).post('/api/chats').send({ title });

      expect(res.status).toBe(201);
      expect(res.body.chat.title).toBe(title);
    });

    it('accepts a title of exactly 1 character (boundary)', async () => {
      const res = await request(app).post('/api/chats').send({ title: 'a' });

      expect(res.status).toBe(201);
      expect(res.body.chat.title).toBe('a');
    });

    it.each([
      ['a number', 123],
      ['an object', {}],  // {} with no title key → treated as missing → 'New Chat', BUT if sent as title value → 400
      ['an array', ['title']],
      ['a boolean', true],
      ['null', null],
    ])('returns 400 when title value is %s (invalid type)', async (_label, badTitle) => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      const res = await request(app)
        .post('/api/chats')
        .send({ title: badTitle });

      expect(res.status).toBe(400);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
    });

    it.each([
      ['a single space', ' '],
      ['multiple spaces', '     '],
      ['tabs and newlines', '\t\n  \r\n'],
    ])('returns 400 for a whitespace-only title (%s)', async (_label, title) => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      const res = await request(app).post('/api/chats').send({ title });

      expect(res.status).toBe(400);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('trims surrounding whitespace before saving', async () => {
      const res = await request(app)
        .post('/api/chats')
        .send({ title: '   Hello world   ' });

      expect(res.status).toBe(201);
      expect(res.body.chat.title).toBe('Hello world');

      const saved = await Chat.findById(res.body.chat._id);
      expect(saved?.title).toBe('Hello world');
    });

    it('returns 400 when the body is malformed JSON', async () => {
      const res = await request(app)
        .post('/api/chats')
        .set('Content-Type', 'application/json')
        .send('{"title": "oops"');

      expect(res.status).toBe(400);
      expect(await Chat.countDocuments()).toBe(0);
    });
  });

  // ─── Default title behaviour ────────────────────────────────────────────────

  describe('default title — creates chat with "New Chat" when title is omitted', () => {
    it('uses "New Chat" when body is an empty object {}', async () => {
      const res = await request(app).post('/api/chats').send({});

      expect(res.status).toBe(201);
      expect(res.body.chat.title).toBe('New Chat');
    });

    it('uses "New Chat" when title key is absent but other keys are sent', async () => {
      const res = await request(app).post('/api/chats').send({ foo: 'bar' });

      expect(res.status).toBe(201);
      expect(res.body.chat.title).toBe('New Chat');
      expect(res.body.chat.foo).toBeUndefined();
    });

    it('persists "New Chat" in the database', async () => {
      const res = await request(app).post('/api/chats').send({});

      const inDb = await Chat.findById(res.body.chat._id);
      expect(inDb?.title).toBe('New Chat');
    });
  });

  // ─── sessionId behaviour ────────────────────────────────────────────────────

  describe('sessionId — always set by ensureSession middleware', () => {
    it('creates a chat with a sessionId even when no cookie is sent', async () => {
      const res = await request(app).post('/api/chats').send({ title: 'First chat' });

      expect(res.status).toBe(201);
      expect(res.body.chat.sessionId).toBeDefined();
      expect(typeof res.body.chat.sessionId).toBe('string');
      expect(res.body.chat.sessionId.length).toBeGreaterThan(0);

      // sessionId should also be persisted in DB
      const inDb = await Chat.findById(res.body.chat._id);
      expect(inDb?.sessionId).toBe(res.body.chat.sessionId);
    });

    it('two requests without a cookie get different sessionIds', async () => {
      // Each supertest request() call is stateless — no cookies are shared
      const firstRes = await request(app).post('/api/chats').send({ title: 'Chat 1' });
      const secondRes = await request(app).post('/api/chats').send({ title: 'Chat 2' });

      expect(firstRes.status).toBe(201);
      expect(secondRes.status).toBe(201);
      expect(firstRes.body.chat.sessionId).not.toBe(secondRes.body.chat.sessionId);
    });

    it('two requests sharing the same session cookie get the same sessionId', async () => {
      // Use a persistent agent to share the cookie jar across requests
      const agent = request.agent(app);

      const firstRes = await agent.post('/api/chats').send({ title: 'Session chat 1' });
      const secondRes = await agent.post('/api/chats').send({ title: 'Session chat 2' });

      expect(firstRes.status).toBe(201);
      expect(secondRes.status).toBe(201);
      expect(firstRes.body.chat.sessionId).toBe(secondRes.body.chat.sessionId);
    });

    it('chats created in the same session are distinct documents with unique _ids', async () => {
      const agent = request.agent(app);

      const firstRes = await agent.post('/api/chats').send({ title: 'Same session A' });
      const secondRes = await agent.post('/api/chats').send({ title: 'Same session B' });

      expect(firstRes.body.chat._id).not.toBe(secondRes.body.chat._id);
      expect(await Chat.countDocuments()).toBe(2);
    });
  });

  // ─── Success — response shape & DB persistence ──────────────────────────────

  describe('success', () => {
    it('returns 201 with the new chat document in the response body', async () => {
      const res = await request(app)
        .post('/api/chats')
        .send({ title: 'My first chat' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        chat: expect.objectContaining({
          _id: expect.any(String),
          title: 'My first chat',
          sessionId: expect.any(String),
          status: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });
      expect(mongoose.Types.ObjectId.isValid(res.body.chat._id)).toBe(true);
      expect(Number.isNaN(new Date(res.body.chat.createdAt).getTime())).toBe(false);
    });

    it('persists the chat in the database', async () => {
      const res = await request(app)
        .post('/api/chats')
        .send({ title: 'Persisted chat' });

      expect(res.status).toBe(201);

      const inDb = await Chat.findById(res.body.chat._id);
      expect(inDb).not.toBeNull();
      expect(inDb?.title).toBe('Persisted chat');
      expect(await Chat.countDocuments()).toBe(1);
    });

    it('creates a distinct chat on every call (different _id, same title)', async () => {
      const first = await request(app).post('/api/chats').send({ title: 'Same title' });
      const second = await request(app).post('/api/chats').send({ title: 'Same title' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.chat._id).not.toBe(second.body.chat._id);
      expect(await Chat.countDocuments()).toBe(2);
    });

    it('creates chats with messages and both are persisted in the database', async () => {
      const agent = request.agent(app);

      // Create chat
      const chatRes = await agent.post('/api/chats').send({ title: 'Chat with messages' });
      expect(chatRes.status).toBe(201);
      const chatId = chatRes.body.chat._id;

      // Insert messages linked to this chat directly (simulating what later routes will do)
      await Message.collection.insertMany([
        {
          chatId: new mongoose.Types.ObjectId(chatId),
          role: 'user',
          content: 'Hello, I need help.',
          status: 'complete',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          chatId: new mongoose.Types.ObjectId(chatId),
          role: 'assistant',
          content: 'Of course! How can I assist you today?',
          status: 'complete',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const chat = await Chat.findById(chatId);
      const messages = await Message.find({ chatId });

      expect(chat).not.toBeNull();
      expect(chat?.title).toBe('Chat with messages');
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('user');
      expect(messages[1]?.role).toBe('assistant');
    });

    it('creates chats for two different sessions and both are independently stored', async () => {
      // Session A chat
      const resA = await request(app).post('/api/chats').send({ title: 'Chat from A' });
      // Session B chat (stateless request = new session)
      const resB = await request(app).post('/api/chats').send({ title: 'Chat from B' });

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      // Both saved to DB
      expect(await Chat.countDocuments()).toBe(2);

      // Each belongs to its own session
      expect(resA.body.chat.sessionId).not.toBe(resB.body.chat.sessionId);

      // Both chats are retrievable
      const chatA = await Chat.findById(resA.body.chat._id);
      const chatB = await Chat.findById(resB.body.chat._id);
      expect(chatA?.title).toBe('Chat from A');
      expect(chatB?.title).toBe('Chat from B');
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 with the error message when save() rejects with an Error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat.prototype, 'save')
        .mockImplementation((() =>
          Promise.reject(new Error('Database connection lost'))) as any);

      const res = await request(app)
        .post('/api/chats')
        .send({ title: 'Valid title' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to create chat',
        error: 'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each([
      ['a string', 'something went wrong'],
      ['null', null],
      ['a number', 42],
    ])(
      "falls back to 'Unknown error' when a non-Error is thrown (%s)",
      async (_label, thrown) => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest
          .spyOn(Chat.prototype, 'save')
          .mockImplementation((() => Promise.reject(thrown)) as any);

        const res = await request(app)
          .post('/api/chats')
          .send({ title: 'Valid title' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          message: 'Failed to create chat',
          error: 'Unknown error',
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});