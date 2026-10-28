import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';
import { seedTestData, SESSION_A, SESSION_B, type SeedResult } from '../../utils/testUtils/testSeed.js';

/**
 * GET /api/chats/:id
 *
 * Route: requireSession → validate({ params: getChatByIdSchema }) → getChatById
 *
 * Controller uses:  Chat.findOne({ _id: id, sessionId })
 *   → sessions scope the lookup; a valid chatId with the wrong session → 404
 *
 * Seed data (from testSeed.ts) — 4 chats, 2 per session:
 *   SESSION_A → [0] 'New Chat'        (2 messages)
 *   SESSION_A → [1] 'Refund request'  (2 messages)
 *   SESSION_B → [2] 'New Chat'        (2 messages)
 *   SESSION_B → [3] 'Billing inquiry' (3 messages)
 */

describe('GET /api/chats/:id', () => {
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

  // ─── Params validation ──────────────────────────────────────────────────────

  describe('validation', () => {
    it.each(['123', 'not-an-id', 'g'.repeat(24), '5f8d0d55b54764421b71'])(
      'returns 400 for malformed id "%s" and never hits the database',
      async (badId) => {
        const findOneSpy = jest.spyOn(Chat, 'findOne' as any);
        const findSpy    = jest.spyOn(Message, 'find');

        const res = await request(app)
          .get(`/api/chats/${badId}`)
          .set('Cookie', `sid=${SESSION_A}`);

        expect(res.status).toBe(400);
        expect(res.body).toBeDefined();
        expect(findOneSpy).not.toHaveBeenCalled();
        expect(findSpy).not.toHaveBeenCalled();
      }
    );
  });

  // ─── Session validation ─────────────────────────────────────────────────────

  describe('session validation', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    it('returns 401 when no session cookie is sent (requireSession blocks the request)', async () => {
      const chatA = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;
      const findOneSpy = jest.spyOn(Chat, 'findOne' as any);

      // No .set('Cookie', ...) at all
      const res = await request(app).get(`/api/chats/${chatA._id.toString()}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session/i);
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('returns 401 when an invalid (non-UUID) sid cookie is sent', async () => {
      const chatA = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .get(`/api/chats/${chatA._id.toString()}`)
        .set('Cookie', 'sid=not-a-valid-uuid');

      expect(res.status).toBe(401);
    });

    it('returns 404 when the session cookie is valid but belongs to a different session (cross-session access)', async () => {
      // SESSION_A chat requested with SESSION_B's cookie → should be invisible
      const sessionAChat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .get(`/api/chats/${sessionAChat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`);   // wrong session

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
    });

    it('returns 404 when SESSION_B cookie is used to access a SESSION_A chat (reverse direction)', async () => {
      // Pick SESSION_B chat; try to access with SESSION_A cookie
      const sessionBChat = seedResult.chats.find((c) => c.sessionId === SESSION_B)!;

      const res = await request(app)
        .get(`/api/chats/${sessionBChat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
    });
  });

  // ─── Not found ──────────────────────────────────────────────────────────────

  describe('not found', () => {
    it('returns 404 when the id is valid but no chat exists', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .get(`/api/chats/${missingId}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
    });
  });

  // ─── Success — all four seeded chats ───────────────────────────────────────

  describe('success — retrieve seeded chats by sessionId', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    // SESSION_A — 'New Chat' (default title)
    it('returns SESSION_A "New Chat" with its messages', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'New Chat'
      )!;
      expect(chat).toBeDefined();

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(chat._id.toString());
      expect(res.body.chat.title).toBe('New Chat');
      expect(res.body.chat.sessionId).toBe(SESSION_A);
      expect(res.body.messages).toHaveLength(2);
    });

    // SESSION_A — 'Refund request' (custom title)
    it('returns SESSION_A "Refund request" with its messages', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'Refund request'
      )!;
      expect(chat).toBeDefined();

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(chat._id.toString());
      expect(res.body.chat.title).toBe('Refund request');
      expect(res.body.chat.sessionId).toBe(SESSION_A);
      expect(res.body.messages).toHaveLength(2);
    });

    // SESSION_B — 'New Chat' (default title)
    it('returns SESSION_B "New Chat" with its messages', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_B && c.title === 'New Chat'
      )!;
      expect(chat).toBeDefined();

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(chat._id.toString());
      expect(res.body.chat.title).toBe('New Chat');
      expect(res.body.chat.sessionId).toBe(SESSION_B);
      expect(res.body.messages).toHaveLength(2);
    });

    // SESSION_B — 'Billing inquiry' (custom title)
    it('returns SESSION_B "Billing inquiry" with its messages', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_B && c.title === 'Billing inquiry'
      )!;
      expect(chat).toBeDefined();

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(chat._id.toString());
      expect(res.body.chat.title).toBe('Billing inquiry');
      expect(res.body.chat.sessionId).toBe(SESSION_B);
      expect(res.body.messages).toHaveLength(3); // billing inquiry has 3 messages in seed
    });

    // Response shape
    it('returns the correct response shape — chat object and messages array', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        chat: expect.objectContaining({
          _id:       expect.any(String),
          title:     expect.any(String),
          sessionId: SESSION_A,
          status:    'active',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
        messages: expect.any(Array),
      });

      // Every message in the response belongs to this chat
      res.body.messages.forEach((m: { chatId: string }) => {
        expect(m.chatId).toBe(chat._id.toString());
      });
    });

    it('returns messages sorted by createdAt ascending', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_B && c.title === 'Billing inquiry'
      )!;

      const res = await request(app)
        .get(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`);

      expect(res.status).toBe(200);
      const times: number[] = res.body.messages.map(
        (m: { createdAt: string }) => new Date(m.createdAt).getTime()
      );
      const sortedAsc = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sortedAsc);
    });

    it('does not leak messages that belong to a different chat in the same session', async () => {
      const chatA = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'New Chat'
      )!;
      const chatB = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'Refund request'
      )!;

      const res = await request(app)
        .get(`/api/chats/${chatA._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      // None of chatB's messages should appear
      res.body.messages.forEach((m: { chatId: string }) => {
        expect(m.chatId).toBe(chatA._id.toString());
        expect(m.chatId).not.toBe(chatB._id.toString());
      });
    });

    it('returns 200 with an empty messages array when the chat has no messages', async () => {
      // Insert a bare chat with no messages
      const { insertedId } = await Chat.collection.insertOne({
        title: 'Empty chat',
        sessionId: SESSION_A,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/chats/${insertedId.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(insertedId.toString());
      expect(res.body.messages).toEqual([]);
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 with the error message when the database fails with an Error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findOne' as any)
        .mockImplementation((() =>
          Promise.reject(new Error('Database connection lost'))) as any);

      const id = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/chats/${id}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to fetch chat',
        error:   'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns 500 when Message.find fails after the chat was found', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const id = new mongoose.Types.ObjectId().toString();

      jest
        .spyOn(Chat, 'findOne' as any)
        .mockImplementation((() => ({
          lean: jest.fn(() => Promise.resolve({ _id: id, sessionId: SESSION_A })),
        })) as any);
      jest.spyOn(Message, 'find').mockImplementation((() => ({
        sort: jest.fn(() => Promise.reject(new Error('Messages query failed'))),
      })) as any);

      const res = await request(app)
        .get(`/api/chats/${id}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to fetch chat',
        error:   'Messages query failed',
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each([
      ['a string', 'something went wrong'],
      ['an empty object', {}],
      ['null', null],
      ['a number', 42],
    ])(
      "falls back to 'Unknown error' when a non-Error is thrown (%s)",
      async (_label, thrown) => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest
          .spyOn(Chat, 'findOne' as any)
          .mockImplementation((() => Promise.reject(thrown)) as any);

        const id = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
          .get(`/api/chats/${id}`)
          .set('Cookie', `sid=${SESSION_A}`);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          message: 'Failed to fetch chat',
          error:   'Unknown error',
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});