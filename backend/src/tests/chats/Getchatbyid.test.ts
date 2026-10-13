import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';
import app from '../../app.js';

const TEST_DB_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/test_db';

/**
 * Helpers: insert via the raw collection so Mongoose timestamps
 * don't overwrite our controlled createdAt/updatedAt values.
 * Adjust the fields below to match your Chat / Message schemas.
 */
const seedChat = async (title = 'Test chat') => {
  const now = new Date('2025-01-01T00:00:00.000Z');
  const { insertedId } = await Chat.collection.insertOne({
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
  return insertedId;
};

const seedMessages = async (
  chatId: mongoose.Types.ObjectId,
  entries: { content: string; offsetMinutes: number }[]
) => {
  const base = new Date('2025-01-01T00:00:00.000Z').getTime();
  await Message.collection.insertMany(
    entries.map(({ content, offsetMinutes }) => ({
      chatId,
      role: 'user',
      content,
      createdAt: new Date(base + offsetMinutes * 60_000),
      updatedAt: new Date(base + offsetMinutes * 60_000),
    }))
  );
};

describe('GET /api/chats/:id', () => {
  beforeAll(async () => {
    // Connect only if the app didn't already do it
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // each test starts from clean collections
    await Chat.deleteMany({});
    await Message.deleteMany({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validation', () => {
    it.each(['123', 'not-an-id', 'g'.repeat(24), '5f8d0d55b54764421b71'])(
      'returns 400 for malformed id "%s" and never hits the database',
      async (badId) => {
        const findByIdSpy = jest.spyOn(Chat, 'findById');
        const findSpy = jest.spyOn(Message, 'find');

        const res = await request(app).get(`/api/chats/${badId}`);

        expect(res.status).toBe(400);
        expect(res.body).toBeDefined();
        expect(findByIdSpy).not.toHaveBeenCalled();
        expect(findSpy).not.toHaveBeenCalled();
      }
    );
  });

  describe('not found', () => {
    it('returns 404 when the id is valid but no chat exists', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      const res = await request(app).get(`/api/chats/${missingId}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Chat not found' });
    });
  });

  describe('success', () => {
    it('returns the chat and its messages sorted by createdAt ascending', async () => {
      const chatId = await seedChat('My chat');
      // inserted out of order on purpose
      await seedMessages(chatId, [
        { content: 'third', offsetMinutes: 3 },
        { content: 'first', offsetMinutes: 1 },
        { content: 'fifth', offsetMinutes: 5 },
        { content: 'second', offsetMinutes: 2 },
        { content: 'fourth', offsetMinutes: 4 },
      ]);

      const res = await request(app).get(`/api/chats/${chatId.toString()}`);

      expect(res.status).toBe(200);
      expect(res.body.chat._id).toBe(chatId.toString());
      expect(res.body.chat.title).toBe('My chat');

      expect(res.body.messages).toHaveLength(5);

      const times: number[] = res.body.messages.map((m: { createdAt: string }) =>
        new Date(m.createdAt).getTime()
      );
      const sortedAsc = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sortedAsc);

      expect(res.body.messages.map((m: { content: string }) => m.content)).toEqual([
        'first',
        'second',
        'third',
        'fourth',
        'fifth',
      ]);
    });

    it('returns 200 with an empty messages array when the chat has no messages', async () => {
      const fakeChat = {
        _id: new mongoose.Types.ObjectId().toString(),
        title: 'Empty chat',
      };

      jest.spyOn(Chat, 'findById').mockImplementation((() =>
        Promise.resolve(fakeChat)) as any);
      jest.spyOn(Message, 'find').mockImplementation((() => ({
        sort: jest.fn(() => Promise.resolve([])),
      })) as any);

      const res = await request(app).get(`/api/chats/${fakeChat._id}`);

      expect(res.status).toBe(200);
      expect(res.body.chat).toEqual(fakeChat);
      expect(res.body.messages).toEqual([]);
    });

    it("does not leak messages that belong to other chats", async () => {
      const chatId = await seedChat('Chat A');
      const otherId = await seedChat('Chat B');

      await seedMessages(chatId, [
        { content: 'A-1', offsetMinutes: 1 },
        { content: 'A-2', offsetMinutes: 2 },
      ]);
      await seedMessages(otherId, [
        { content: 'B-1', offsetMinutes: 1 },
        { content: 'B-2', offsetMinutes: 2 },
        { content: 'B-3', offsetMinutes: 3 },
      ]);

      const res = await request(app).get(`/api/chats/${chatId.toString()}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(
        res.body.messages.every(
          (m: { chatId: string }) => m.chatId === chatId.toString()
        )
      ).toBe(true);
      expect(res.body.messages.map((m: { content: string }) => m.content)).toEqual([
        'A-1',
        'A-2',
      ]);
    });
  });

  describe('error handling', () => {
    it('returns 500 with the error message when the database fails with an Error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest
        .spyOn(Chat, 'findById')
        .mockImplementation((() =>
          Promise.reject(new Error('Database connection lost'))) as any);

      const id = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/api/chats/${id}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to fetch chat',
        error: 'Database connection lost',
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns 500 when Message.find fails after the chat was found', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const id = new mongoose.Types.ObjectId().toString();

      jest
        .spyOn(Chat, 'findById')
        .mockImplementation((() => Promise.resolve({ _id: id })) as any);
      jest.spyOn(Message, 'find').mockImplementation((() => ({
        sort: jest.fn(() => Promise.reject(new Error('Messages query failed'))),
      })) as any);

      const res = await request(app).get(`/api/chats/${id}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        message: 'Failed to fetch chat',
        error: 'Messages query failed',
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
          .spyOn(Chat, 'findById')
          .mockImplementation((() => Promise.reject(thrown)) as any);

        const id = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(`/api/chats/${id}`);

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
          message: 'Failed to fetch chat',
          error: 'Unknown error',
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});