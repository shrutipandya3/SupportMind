import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';
import { seedTestData, SESSION_A, SESSION_B, type SeedResult } from '../../utils/testUtils/testSeed.js';

/**
 * PATCH /api/chats/:id
 *
 * Route: requireSession → validate({ params: updateChatParamsSchema, body: updateChatBodySchema }) → updateChat
 *
 * Schema contracts assumed:
 *
 *   updateChatParamsSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) })
 *
 *   updateChatBodySchema = z.object({
 *     title:  titleSchema.optional(),   // trim → min(1) → max(100)
 *     status: chatStatusSchema.optional(),
 *   }).refine(body => body.title !== undefined || body.status !== undefined,
 *     { message: 'At least one of title or status must be provided' })
 *
 * Key contracts:
 *  - requireSession fires FIRST: no cookie → 401, invalid UUID cookie → 401
 *  - Controller uses Chat.findOneAndUpdate({ _id, sessionId }) — NOT findByIdAndUpdate
 *  - Wrong session cookie → findOneAndUpdate finds nothing → 404
 *  - All requests in this file must carry a valid sid cookie
 *
 * Seed data (from testSeed.ts) — 4 chats, 2 per session:
 *   SESSION_A → 'New Chat' (active) + 'Refund request' (active)
 *   SESSION_B → 'New Chat' (active) + 'Billing inquiry' (active)
 */

const validObjectId = () => new mongoose.Types.ObjectId().toString();

/** Insert a raw chat doc with SESSION_A so tests control all fields */
const insertChat = async (title: string, sessionId = SESSION_A) => {
  const { insertedId } = await Chat.collection.insertOne({
    title,
    sessionId,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertedId;
};

describe('PATCH /api/chats/:id', () => {
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

  // ─── Session validation ─────────────────────────────────────────────────────

  describe('session validation', () => {
    it('returns 401 when no session cookie is sent (requireSession blocks before validate)', async () => {
      const findSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      // No .set('Cookie', ...) — requireSession fires before validate or the controller
      const res = await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session/i);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('returns 401 when an invalid (non-UUID) sid cookie is sent', async () => {
      const findSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .set('Cookie', 'sid=not-a-valid-uuid')
        .send({ title: 'Updated' });

      expect(res.status).toBe(401);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('returns 404 when session cookie is valid but the chat belongs to a different session', async () => {
      // Chat owned by SESSION_A — SESSION_B's cookie should not be able to update it
      const chatId = await insertChat('Session A Chat', SESSION_A);
      const findSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any).mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/chats/${chatId.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`)   // wrong session
        .send({ title: 'Hijacked Title' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });

      // Title must not have changed
      jest.restoreAllMocks();
      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe('Session A Chat');
    });

    it('returns 404 when SESSION_A tries to update a SESSION_B chat (reverse direction)', async () => {
      const chatId = await insertChat('Session B Chat', SESSION_B);

      const res = await request(app)
        .patch(`/api/chats/${chatId.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Hijacked Title' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });

      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe('Session B Chat');
    });
  });

  // ─── Params validation (id) ─────────────────────────────────────────────────

  describe('params validation (id)', () => {
    it.each([
      ['too short',                  '123'],
      ['not hex characters',         'g'.repeat(24)],
      ['25 characters',              'a'.repeat(25)],
      ['23 characters',              'a'.repeat(23)],
      ['contains special characters','invalid-id-with-dashes!!'],
    ])('returns 400 when id is invalid (%s)', async (_label, badId) => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${badId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('accepts a valid 24-char hex id (lowercase)', async () => {
      const chatId = await insertChat('Original');

      const res = await request(app)
        .patch(`/api/chats/${chatId.toString().toLowerCase()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Lower' });

      expect(res.status).toBe(200);
    });

    it('accepts a valid 24-char hex id (uppercase)', async () => {
      const chatId = await insertChat('Original');

      const res = await request(app)
        .patch(`/api/chats/${chatId.toString().toUpperCase()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Upper' });

      expect(res.status).toBe(200);
    });
  });

  // ─── Body validation (title) ────────────────────────────────────────────────

  describe('body validation (title)', () => {
    let chatId: string;

    beforeEach(async () => {
      const id = await insertChat('Original');
      chatId = id.toString();
    });

    const expectUnchanged = async () => {
      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe('Original');
    };

    it('returns 400 when title is an empty string', async () => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it.each([
      ['a single space',    ' '],
      ['multiple spaces',   '     '],
      ['tabs and newlines', '\t\n  \r\n'],
    ])('returns 400 for a whitespace-only title (%s)', async (_label, title) => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title is missing AND status is missing (empty body object)', async () => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({});

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when only unrelated fields are sent', async () => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when no body is sent at all', async () => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`);

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title exceeds 100 characters', async () => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'a'.repeat(101) });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when content is > 100 chars even after trim', async () => {
      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: `  ${'a'.repeat(101)}  ` });

      expect(res.status).toBe(400);
      await expectUnchanged();
    });

    it.each([
      ['a number',  123],
      ['a boolean', true],
      ['an object', {}],
      ['an array',  ['title']],
      ['null',      null],
    ])('returns 400 when title is %s (invalid type)', async (_label, badTitle) => {
      const updateSpy = jest.spyOn(Chat, 'findOneAndUpdate' as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: badTitle });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when the body is malformed JSON', async () => {
      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .set('Content-Type', 'application/json')
        .send('{"title": "oops"');

      expect(res.status).toBe(400);
      await expectUnchanged();
    });

    it('accepts a title of exactly 100 characters (boundary)', async () => {
      const title = 'a'.repeat(100);

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe(title);
    });

    it('accepts a title of exactly 1 character (boundary)', async () => {
      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'a' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('a');
    });
  });

  // ─── Not found ──────────────────────────────────────────────────────────────

  describe('not found', () => {
    it('returns 404 when no chat exists with a valid, unused id', async () => {
      const res = await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('does not create a new chat when the id does not exist (no upsert)', async () => {
      await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Ghost chat' });

      expect(await Chat.countDocuments()).toBe(0);
    });
  });

  // ─── Success — matching sessionId ───────────────────────────────────────────

  describe('success — update allowed only when sessionId matches', () => {
    let seedResult: SeedResult;

    beforeEach(async () => {
      seedResult = await seedTestData();
    });

    it('updates the title of a SESSION_A chat using SESSION_A cookie', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'Refund request'
      )!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Refund resolved' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Refund resolved');
      expect(res.body.chat._id).toBe(chat._id.toString());
      expect(res.body.chat.sessionId).toBe(SESSION_A);

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Refund resolved');
    });

    it('updates the title of a SESSION_B chat using SESSION_B cookie', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_B && c.title === 'Billing inquiry'
      )!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_B}`)
        .send({ title: 'Billing resolved' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Billing resolved');
      expect(res.body.chat.sessionId).toBe(SESSION_B);
    });

    it('returns 200 with the updated chat in the expected shape', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        chat: expect.objectContaining({
          _id:       chat._id.toString(),
          title:     'Updated Title',
          sessionId: SESSION_A,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });
      expect(Number.isNaN(new Date(res.body.chat.createdAt).getTime())).toBe(false);
      expect(Number.isNaN(new Date(res.body.chat.updatedAt).getTime())).toBe(false);
    });

    it('returns the NEW document (not the pre-update one)', async () => {
      const chat = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'Refund request'
      )!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'After' });

      expect(res.body.chat.title).toBe('After');
      expect(res.body.chat.title).not.toBe('Refund request');
    });

    it('persists the new title in the database', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Persisted Title' });

      expect(res.status).toBe(200);

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Persisted Title');
    });

    it('trims leading/trailing whitespace before saving', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: ' Updated Title ' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Updated Title');

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Updated Title');
    });

    it('keeps inner whitespace intact while trimming the edges', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: '  Hello   big   world  ' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Hello   big   world');
    });

    it('bumps updatedAt but leaves createdAt unchanged', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;
      const chatDoc = await Chat.findById(chat._id);
      const originalCreatedAt = chatDoc!.createdAt.toISOString();
      const originalUpdatedAt = chatDoc!.updatedAt.toISOString();

      await new Promise((resolve) => setTimeout(resolve, 20));

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Changed' });

      expect(res.status).toBe(200);
      expect(res.body.chat.createdAt).toBe(originalCreatedAt);
      expect(new Date(res.body.chat.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('is idempotent: sending the same title twice returns 200 both times', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const first = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Same' });
      const second = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Same' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.chat.title).toBe('Same');
    });

    it('only updates the targeted chat and leaves others in the same session untouched', async () => {
      const target = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'Refund request'
      )!;
      const other = seedResult.chats.find(
        (c) => c.sessionId === SESSION_A && c.title === 'New Chat'
      )!;

      const res = await request(app)
        .patch(`/api/chats/${target._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Target Updated' });

      expect(res.status).toBe(200);

      const targetInDb = await Chat.findById(target._id);
      const otherInDb  = await Chat.findById(other._id);
      expect(targetInDb?.title).toBe('Target Updated');
      expect(otherInDb?.title).toBe('New Chat');
    });

    it('ignores unknown extra fields in the body', async () => {
      const chat = seedResult.chats.find((c) => c.sessionId === SESSION_A)!;

      const res = await request(app)
        .patch(`/api/chats/${chat._id.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Updated Title', foo: 'bar' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Updated Title');
      expect(res.body.chat.foo).toBeUndefined();
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 with the error message when findOneAndUpdate rejects with an Error', async () => {
      const chatId = await insertChat('Original');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findOneAndUpdate' as any)
        .mockImplementation((() =>
          Promise.reject(new Error('Database connection lost'))) as any);

      const res = await request(app)
        .patch(`/api/chats/${chatId.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Valid title' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to update chat title',
        error:   'Database connection lost',
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
        const chatId = await insertChat('Original');
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest
          .spyOn(Chat, 'findOneAndUpdate' as any)
          .mockImplementation((() => Promise.reject(thrown)) as any);

        const res = await request(app)
          .patch(`/api/chats/${chatId.toString()}`)
          .set('Cookie', `sid=${SESSION_A}`)
          .send({ title: 'Valid title' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          message: 'Failed to update chat title',
          error:   'Unknown error',
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );

    it('does not change the stored title when the update fails', async () => {
      const chatId = await insertChat('Original');
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findOneAndUpdate' as any)
        .mockImplementation((() => Promise.reject(new Error('boom'))) as any);

      await request(app)
        .patch(`/api/chats/${chatId.toString()}`)
        .set('Cookie', `sid=${SESSION_A}`)
        .send({ title: 'Nope' });

      jest.restoreAllMocks();
      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe('Original');
    });
  });
});
