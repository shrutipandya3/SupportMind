import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';

/**
 * NOTE: these tests assume the schemas are:
 *
 * export const updateChatParamsSchema = z.object({
 *   id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format'),
 * });
 *
 * export const updateChatBodySchema = z.object({
 *   title: z
 *     .string()
 *     .trim()                                   // <-- must be added BEFORE .min(1)
 *     .min(1, 'Title cannot be empty')
 *     .max(100, 'Title cannot exceed 100 characters'),
 * });
 *
 * IMPORTANT: your current updateChatBodySchema has no `.trim()`. Without it,
 * a whitespace-only title like ' ' passes `.min(1)` and the controller then
 * trims it to '' (which is not a 400). Add `.trim()` before `.min(1)` so the
 * whitespace-only tests below pass.
 *
 * Also assumed:
 *   - the route runs `validate({ params, body })` BEFORE the controller
 *   - `title` is required (no default), so missing/undefined title -> 400
 *   - req.body undefined (no body, Express 5) -> z.object rejects it -> 400.
 *     On Express 4 express.json() sets req.body = {}, which still yields 400
 *     because `title` is required, so that test works on both.
 */

const validObjectId = () => new mongoose.Types.ObjectId().toString();

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

  describe('params validation (id)', () => {
    it.each([
      ['too short', '123'],
      ['not hex characters', 'g'.repeat(24)],
      ['25 characters', 'a'.repeat(25)],
      ['23 characters', 'a'.repeat(23)],
      ['contains special characters', 'invalid-id-with-dashes!!'],
    ])('returns 400 when id is invalid (%s)', async (_label, badId) => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app)
        .patch(`/api/chats/${badId}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('accepts a valid 24-char hex id (uppercase and lowercase)', async () => {
      const chat = await Chat.create({ title: 'Original' });
      const id = chat._id.toString();

      const lower = await request(app)
        .patch(`/api/chats/${id.toLowerCase()}`)
        .send({ title: 'Lower' });
      expect(lower.status).toBe(200);

      const upper = await request(app)
        .patch(`/api/chats/${id.toUpperCase()}`)
        .send({ title: 'Upper' });
      expect(upper.status).toBe(200);
    });
  });

  describe('body validation (title)', () => {
    let chatId: string;

    beforeEach(async () => {
      const chat = await Chat.create({ title: 'Original' });
      chatId = chat._id.toString();
    });

    const expectUnchanged = async () => {
      const inDb = await Chat.findById(chatId);
      expect(inDb?.title).toBe('Original');
    };

    it('returns 400 when title is an empty string', async () => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app).patch(`/api/chats/${chatId}`).send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it.each([
      ['a single space', ' '],
      ['multiple spaces', '     '],
      ['tabs and newlines', '\t\n  \r\n'],
    ])('returns 400 for a whitespace-only title (%s)', async (_label, title) => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app).patch(`/api/chats/${chatId}`).send({ title });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title is missing (empty body object)', async () => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app).patch(`/api/chats/${chatId}`).send({});

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title is undefined / other fields only', async () => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app).patch(`/api/chats/${chatId}`).send({ foo: 'bar' });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when no body is sent at all', async () => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app).patch(`/api/chats/${chatId}`);

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title exceeds 100 characters', async () => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .send({ title: 'a'.repeat(101) });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when title is only long because of inner content (101 chars after trim)', async () => {
      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .send({ title: `  ${'a'.repeat(101)}  ` });

      expect(res.status).toBe(400);
      await expectUnchanged();
    });

    it.each([
      ['a number', 123],
      ['a boolean', true],
      ['an object', {}],
      ['an array', ['title']],
      ['null', null],
    ])('returns 400 when title is %s (invalid type)', async (_label, badTitle) => {
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .send({ title: badTitle });

      expect(res.status).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
      await expectUnchanged();
    });

    it('returns 400 when the body is malformed JSON', async () => {
      const res = await request(app)
        .patch(`/api/chats/${chatId}`)
        .set('Content-Type', 'application/json')
        .send('{"title": "oops"');

      expect(res.status).toBe(400);
      await expectUnchanged();
    });

    it('accepts a title of exactly 100 characters (boundary)', async () => {
      const title = 'a'.repeat(100);

      const res = await request(app).patch(`/api/chats/${chatId}`).send({ title });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe(title);
    });

    it('accepts a title of exactly 1 character (boundary)', async () => {
      const res = await request(app).patch(`/api/chats/${chatId}`).send({ title: 'a' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('a');
    });
  });

  describe('not found', () => {
    it('returns 404 when no chat exists with a valid, unused id', async () => {
      const res = await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('does not create a new chat when the id does not exist (no upsert)', async () => {
      await request(app)
        .patch(`/api/chats/${validObjectId()}`)
        .send({ title: 'Ghost chat' });

      expect(await Chat.countDocuments()).toBe(0);
    });
  });

  describe('success', () => {
    it('returns 200 with the updated chat in the expected shape', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        chat: expect.objectContaining({
          _id: chat._id.toString(),
          title: 'Updated Title',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });
      expect(Number.isNaN(new Date(res.body.chat.createdAt).getTime())).toBe(false);
      expect(Number.isNaN(new Date(res.body.chat.updatedAt).getTime())).toBe(false);
    });

    it('returns the NEW document (not the pre-update one)', async () => {
      const chat = await Chat.create({ title: 'Before' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'After' });

      expect(res.body.chat.title).toBe('After');
      expect(res.body.chat.title).not.toBe('Before');
    });

    it('persists the new title in the database', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Persisted Title' });

      expect(res.status).toBe(200);

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Persisted Title');
      expect(await Chat.countDocuments()).toBe(1);
    });

    it('trims leading/trailing whitespace before saving', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: ' Updated Title ' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Updated Title');

      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Updated Title');
    });

    it('keeps inner whitespace intact while trimming the edges', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: '  Hello   big   world  ' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Hello   big   world');
    });

    it('bumps updatedAt but leaves createdAt unchanged', async () => {
      const chat = await Chat.create({ title: 'Original' });
      const originalCreatedAt = chat.createdAt.toISOString();
      const originalUpdatedAt = chat.updatedAt.toISOString();

      await new Promise((resolve) => setTimeout(resolve, 20));

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Changed' });

      expect(res.status).toBe(200);
      expect(res.body.chat.createdAt).toBe(originalCreatedAt);
      expect(new Date(res.body.chat.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('is idempotent: sending the same title twice returns 200 both times', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const first = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Same' });
      const second = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Same' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.chat.title).toBe('Same');
      expect(await Chat.countDocuments()).toBe(1);
    });

    it('only updates the targeted chat and leaves others untouched', async () => {
      const target = await Chat.create({ title: 'Target' });
      const other = await Chat.create({ title: 'Other' });

      const res = await request(app)
        .patch(`/api/chats/${target._id}`)
        .send({ title: 'Target Updated' });

      expect(res.status).toBe(200);

      const targetInDb = await Chat.findById(target._id);
      const otherInDb = await Chat.findById(other._id);
      expect(targetInDb?.title).toBe('Target Updated');
      expect(otherInDb?.title).toBe('Other');
    });

    it('ignores unknown extra fields in the body', async () => {
      const chat = await Chat.create({ title: 'Original' });

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Updated Title', foo: 'bar' });

      expect(res.status).toBe(200);
      expect(res.body.chat.title).toBe('Updated Title');
      expect(res.body.chat.foo).toBeUndefined();
    });

    it('calls findByIdAndUpdate with the trimmed title and { returnDocument: "after", runValidators: true }', async () => {
      const chat = await Chat.create({ title: 'Original' });
      const updateSpy = jest.spyOn(Chat, 'findByIdAndUpdate');

      await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: '  Spy Title  ' });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(
        chat._id.toString(),
        { title: 'Spy Title' },
        { returnDocument: 'after', runValidators: true }
      );
    });
  });

  describe('error handling', () => {
    it('returns 500 with the error message when findByIdAndUpdate rejects with an Error', async () => {
      const chat = await Chat.create({ title: 'Original' });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findByIdAndUpdate')
        .mockImplementation((() =>
          Promise.reject(new Error('Database connection lost'))) as any);

      const res = await request(app)
        .patch(`/api/chats/${chat._id}`)
        .send({ title: 'Valid title' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to update chat title',
        error: 'Database connection lost',
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
        const chat = await Chat.create({ title: 'Original' });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest
          .spyOn(Chat, 'findByIdAndUpdate')
          .mockImplementation((() => Promise.reject(thrown)) as any);

        const res = await request(app)
          .patch(`/api/chats/${chat._id}`)
          .send({ title: 'Valid title' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          message: 'Failed to update chat title',
          error: 'Unknown error',
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );

    it('does not change the stored title when the update fails', async () => {
      const chat = await Chat.create({ title: 'Original' });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findByIdAndUpdate')
        .mockImplementation((() => Promise.reject(new Error('boom'))) as any);

      await request(app).patch(`/api/chats/${chat._id}`).send({ title: 'Nope' });

      jest.restoreAllMocks();
      const inDb = await Chat.findById(chat._id);
      expect(inDb?.title).toBe('Original');
    });
  });
});
