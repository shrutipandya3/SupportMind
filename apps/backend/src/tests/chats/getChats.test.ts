import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';
import { seedTestData, SESSION_A, SESSION_B, type SeedResult } from '../../utils/testUtils/testSeed.js';

/**
 * GET /api/chats?status=active|archived
 *
 * Route: optionalSession → getChats
 *
 * Key contracts:
 *  - optionalSession (NOT requireSession): a missing or unrecognised sid cookie
 *    is NOT an error — the controller returns 200 { chats: [] } instead.
 *  - The controller scopes the query to req.sessionId, so each session only
 *    ever sees its own chats. A different session gets an empty list, never
 *    another session's chats.
 *  - Default status filter is 'active'; pass ?status=archived for archived chats.
 *  - Results are sorted by updatedAt descending (most recent first).
 *
 * Seed data (from testSeed.ts) — 4 chats, 2 per session:
 *   SESSION_A → 'New Chat' (active) + 'Refund request' (active)
 *   SESSION_B → 'New Chat' (active) + 'Billing inquiry' (active)
 */

describe('GET /api/chats', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await dbConnect();
    }
  });

  afterAll(async () => await dbDisconnect());

  beforeEach(async () => {
    await Chat.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── No / invalid session — graceful empty response ─────────────────────────

  describe('no or invalid session (optionalSession — returns empty list, not an error)', () => {
    beforeEach(async () => {
      // Seed chats so we can prove they are NOT returned to the wrong session
      await seedTestData();
    });

    it('returns 200 { chats: [] } when no session cookie is sent', async () => {
      // No .set('Cookie', ...) — optionalSession lets it through; controller sees no sessionId
      const res = await request(app).get('/api/chats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chats: [] });
    });

    it('returns 200 { chats: [] } when an invalid (non-UUID) sid cookie is sent', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', 'sid=not-a-valid-uuid');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chats: [] });
    });

    it('returns 200 { chats: [] } when a valid-format but unknown sessionId is sent', async () => {
      // A well-formed UUID that doesn't match any seeded chat's sessionId
      const unknownSession = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${unknownSession}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chats: [] });
    });
  });

  // ─── Session isolation — wrong session sees nothing ──────────────────────────

  describe('session isolation — a session can only see its own chats', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    it('SESSION_A cannot see SESSION_B chats (gets empty list instead)', async () => {
      // All seeded chats belong to SESSION_A or SESSION_B.
      // SESSION_B's chats must NOT appear when SESSION_A makes the request.
      const sessionBTitles = seedResult.chats
        .filter((c) => c.sessionId === SESSION_B)
        .map((c) => c.title);

      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      const returnedTitles = res.body.chats.map((c: { title: string }) => c.title);
      sessionBTitles.forEach((title) => {
        expect(returnedTitles).not.toContain(title);
      });
    });

    it('SESSION_B cannot see SESSION_A chats (gets empty list instead)', async () => {
      const sessionATitles = seedResult.chats
        .filter((c) => c.sessionId === SESSION_A)
        .map((c) => c.title);

      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_B}`);

      expect(res.status).toBe(200);
      const returnedTitles = res.body.chats.map((c: { title: string }) => c.title);
      sessionATitles.forEach((title) => {
        expect(returnedTitles).not.toContain(title);
      });
    });
  });

  // ─── Success — SESSION_A retrieves its own chats ─────────────────────────────

  describe('success — SESSION_A retrieves its own chats', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    it('returns exactly the 2 active chats that belong to SESSION_A', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(2);

      // Every returned chat must belong to SESSION_A
      res.body.chats.forEach((chat: { sessionId: string }) => {
        expect(chat.sessionId).toBe(SESSION_A);
      });
    });

    it("returns SESSION_A's 'New Chat'", async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      const titles = res.body.chats.map((c: { title: string }) => c.title);
      expect(titles).toContain('New Chat');
    });

    it("returns SESSION_A's 'Refund request'", async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      const titles = res.body.chats.map((c: { title: string }) => c.title);
      expect(titles).toContain('Refund request');
    });

    it('returns chats sorted by updatedAt descending (most recent first)', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      const times: number[] = res.body.chats.map((c: { updatedAt: string }) =>
        new Date(c.updatedAt).getTime()
      );
      const sortedDesc = [...times].sort((a, b) => b - a);
      expect(times).toEqual(sortedDesc);
    });

    it('returns the correct response shape for each chat', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      res.body.chats.forEach((chat: Record<string, unknown>) => {
        expect(chat).toMatchObject({
          _id:       expect.any(String),
          title:     expect.any(String),
          sessionId: SESSION_A,
          status:    'active',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
        expect(mongoose.Types.ObjectId.isValid(chat._id as string)).toBe(true);
      });
    });
  });

  // ─── Success — SESSION_B retrieves its own chats ─────────────────────────────

  describe('success — SESSION_B retrieves its own chats', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    it('returns exactly the 2 active chats that belong to SESSION_B', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_B}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(2);

      res.body.chats.forEach((chat: { sessionId: string }) => {
        expect(chat.sessionId).toBe(SESSION_B);
      });
    });

    it("returns SESSION_B's 'New Chat'", async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_B}`);

      const titles = res.body.chats.map((c: { title: string }) => c.title);
      expect(titles).toContain('New Chat');
    });

    it("returns SESSION_B's 'Billing inquiry'", async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_B}`);

      const titles = res.body.chats.map((c: { title: string }) => c.title);
      expect(titles).toContain('Billing inquiry');
    });
  });

  // ─── Status filter ───────────────────────────────────────────────────────────

  describe('status filter', () => {
    beforeEach(async () => {
      // Insert one active and one archived chat for SESSION_A
      const now = Date.now();
      await Chat.collection.insertMany([
        {
          title:     'Active chat',
          sessionId: SESSION_A,
          status:    'active',
          createdAt: new Date(now - 2000),
          updatedAt: new Date(now - 2000),
        },
        {
          title:     'Archived chat',
          sessionId: SESSION_A,
          status:    'archived',
          createdAt: new Date(now - 1000),
          updatedAt: new Date(now - 1000),
        },
      ]);
    });

    it('returns only active chats by default (no ?status param)', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].title).toBe('Active chat');
      expect(res.body.chats[0].status).toBe('active');
    });

    it('returns only active chats when ?status=active is passed explicitly', async () => {
      const res = await request(app)
        .get('/api/chats?status=active')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].status).toBe('active');
    });

    it('returns only archived chats when ?status=archived', async () => {
      const res = await request(app)
        .get('/api/chats?status=archived')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].title).toBe('Archived chat');
      expect(res.body.chats[0].status).toBe('archived');
    });

    it('returns 400 when ?status is an invalid value', async () => {
      const res = await request(app)
        .get('/api/chats?status=deleted')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(400);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 with an error response when the database fails', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(Chat, 'find').mockImplementation(
        () =>
          ({
            sort: jest.fn(() => ({
              lean: jest.fn(() => Promise.reject(new Error('Database connection lost'))),
            })),
          }) as any
      );

      const res = await request(app)
        .get('/api/chats')
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to fetch chats',
        error:   'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});