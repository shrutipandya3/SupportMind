import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import app from '../../app.js';

const TEST_DB_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/test_db';

/**
 * NOTE: these tests assume the schema is:
 *
 * export const createChatSchema = z.object({
 *   title: z
 *     .string()
 *     .trim()
 *     .min(1, 'Title cannot be empty')
 *     .max(100, 'Title cannot exceed 100 characters')
 *     .optional()
 *     .default('New Chat'),
 * });
 *
 * i.e. `.trim()` added, and the default KEPT:
 *   - `{}` or a missing title        -> falls back to 'New Chat', 201
 *   - req.body undefined (no body)   -> z.object() rejects undefined, 400
 *
 * The undefined case only occurs when the body parser leaves req.body
 * undefined (Express 5). On Express 4, express.json() sets req.body = {} for
 * an empty request, which would give a 201 instead; adjust or skip that
 * test if you're on Express 4.
 *
 * It also assumes the route runs the zod schema through a validation
 * middleware BEFORE the controller, e.g.
 *   router.post('/', validate(createChatSchema), createChat);
 */

describe('POST /api/chats', () => {
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validation', () => {
    it('returns 400 when title is an empty string (min(1) violation)', async () => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      const res = await request(app).post('/api/chats').send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
    });

    it('returns 400 when title is longer than 100 characters', async () => {
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
      ['an object', {}],
      ['an array', ['title']],
      ['a boolean', true],
      ['null', null],
    ])('returns 400 when title is %s (invalid type)', async (_label, badTitle) => {
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

    it('returns 400 when req.body is undefined (z.object rejects undefined)', async () => {
      const saveSpy = jest.spyOn(Chat.prototype, 'save');

      // No body and no Content-Type => req.body is undefined (Express 5)
      const res = await request(app).post('/api/chats');

      expect(res.status).toBe(400);
      expect(res.body).toBeDefined();
      expect(saveSpy).not.toHaveBeenCalled();
      expect(await Chat.countDocuments()).toBe(0);
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

  describe('success', () => {
    it('returns 201 Created with the new chat in the response body', async () => {
      const res = await request(app)
        .post('/api/chats')
        .send({ title: 'My first chat' });

      expect(res.status).toBe(201);
      expect(res.status).not.toBe(200);
      expect(res.body).toEqual({
        chat: expect.objectContaining({
          _id: expect.any(String),
          title: 'My first chat',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      });
      expect(mongoose.Types.ObjectId.isValid(res.body.chat._id)).toBe(true);
      expect(Number.isNaN(new Date(res.body.chat.createdAt).getTime())).toBe(false);
      expect(Number.isNaN(new Date(res.body.chat.updatedAt).getTime())).toBe(false);
    });

    describe('default title', () => {
      it("creates a chat titled 'New Chat' when the body is an empty object", async () => {
        const res = await request(app).post('/api/chats').send({});

        expect(res.status).toBe(201);
        expect(res.body.chat).toEqual(
          expect.objectContaining({ _id: expect.any(String), title: 'New Chat' })
        );
      });

      it("creates a chat titled 'New Chat' when title is omitted but other fields are sent", async () => {
        const res = await request(app).post('/api/chats').send({ foo: 'bar' });

        expect(res.status).toBe(201);
        expect(res.body.chat.title).toBe('New Chat');
        expect(res.body.chat.foo).toBeUndefined();
      });

      it("persists the default title 'New Chat' in the database", async () => {
        const res = await request(app).post('/api/chats').send({});

        const inDb = await Chat.findById(res.body.chat._id);
        expect(inDb?.title).toBe('New Chat');
        expect(await Chat.countDocuments()).toBe(1);
      });
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

    it('creates a distinct chat on every call', async () => {
      const first = await request(app).post('/api/chats').send({ title: 'Same' });
      const second = await request(app).post('/api/chats').send({ title: 'Same' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.chat._id).not.toBe(second.body.chat._id);
      expect(await Chat.countDocuments()).toBe(2);
    });
  });

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
      ['an empty object', {}],
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