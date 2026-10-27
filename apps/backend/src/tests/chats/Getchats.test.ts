import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import app from '../../app.js';
import { dbConnect, dbDisconnect } from '../../utils/testUtils/testDbHandler.js';



describe('GET /api/chats', () => {
  beforeAll(async () => {
    // Connect only if the app didn't already do it
    if (mongoose.connection.readyState === 0) {
      await dbConnect();
    }
  });

  afterAll(async () => await dbDisconnect());

  beforeEach(async () => {
    await Chat.deleteMany({}); // each test starts from a clean collection
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with an empty chats array when nothing is found', async () => {
    const res = await request(app).get('/api/chats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chats: [] });
  });

  it('returns 5 chats sorted by updatedAt descending', async () => {
    // Insert via the raw collection so Mongoose timestamps
    // don't overwrite our controlled updatedAt values.
    // Adjust the fields below to match your Chat schema.
    const base = new Date('2025-01-01T00:00:00.000Z').getTime();
    const docs = [3, 1, 5, 2, 4].map((n) => ({
      title: `Chat ${n}`,
      messages: [],
      createdAt: new Date(base),
      updatedAt: new Date(base + n * 60_000), // inserted out of order on purpose
    }));
    await Chat.collection.insertMany(docs);

    const res = await request(app).get('/api/chats');

    expect(res.status).toBe(200);
    expect(res.body.chats).toHaveLength(5);

    const times: number[] = res.body.chats.map((c: { updatedAt: string }) =>
      new Date(c.updatedAt).getTime()
    );
    const sortedDesc = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sortedDesc);

    // Most recent first
    expect(res.body.chats[0].title).toBe('Chat 5');
    expect(res.body.chats[4].title).toBe('Chat 1');
  });

  it('returns 500 with an error response when the database fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Chat, 'find').mockImplementation(
  () =>
    ({
      sort: jest.fn(() => Promise.reject(new Error('Database connection lost'))),
    }) as any
);

    const res = await request(app).get('/api/chats');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      message: 'Failed to fetch chats',
      error: 'Database connection lost',
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});