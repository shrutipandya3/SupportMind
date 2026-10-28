import mongoose from 'mongoose';
import Chat from '../../db/models/Chat.js';
import Message from '../../db/models/Message.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeededMessage {
  chatId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
}

export interface SeededChat {
  title: string;
  sessionId: string;
  status: 'active' | 'archived';
}

export interface SeedResult {
  chats: { _id: mongoose.Types.ObjectId; title: string; sessionId: string; status: string }[];
  messages: SeededMessage[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

/** Two distinct session IDs used across all tests */
export const SESSION_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
export const SESSION_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

/**
 * 4 chats — 2 per session, one with a default title and one with a custom title:
 *
 *  SESSION_A:
 *    [0] title = 'New Chat'       (default title, no prior user-provided title)
 *    [1] title = 'Refund request' (custom / user-provided title)
 *
 *  SESSION_B:
 *    [2] title = 'New Chat'        (default title)
 *    [3] title = 'Billing inquiry' (custom / user-provided title)
 */
const chatSeedData: (SeededChat & { messages: Omit<SeededMessage, 'chatId'>[] })[] = [
  {
    title: 'New Chat',
    sessionId: SESSION_A,
    status: 'active',
    messages: [
      { role: 'user',      content: 'Hello, I need some help.',                                  status: 'complete' },
      { role: 'assistant', content: 'Hi there! How can I assist you today?',                     status: 'complete' },
    ],
  },
  {
    title: 'Refund request',
    sessionId: SESSION_A,
    status: 'active',
    messages: [
      { role: 'user',      content: 'I would like to request a refund for invoice #INV-4921.',   status: 'complete' },
      { role: 'assistant', content: 'Sure! Could you confirm the reason for the refund?',        status: 'complete' },
    ],
  },
  {
    title: 'New Chat',
    sessionId: SESSION_B,
    status: 'active',
    messages: [
      { role: 'user',      content: 'Hi, I have a question about my account.',                   status: 'complete' },
      { role: 'assistant', content: 'Of course, I am happy to help. What is your question?',     status: 'complete' },
    ],
  },
  {
    title: 'Billing inquiry',
    sessionId: SESSION_B,
    status: 'active',
    messages: [
      { role: 'user',      content: 'Why was I charged twice this month?',                       status: 'complete' },
      { role: 'assistant', content: 'Let me look into your billing records.',                    status: 'complete' },
      { role: 'user',      content: 'Thank you, please check invoice #INV-5100.',                status: 'complete' },
    ],
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────

/**
 * Inserts test chats and messages directly into MongoDB.
 * Only the fields required by the task are set:
 *   - Chat:    title, sessionId, status
 *   - Message: chatId, role, content, status
 *
 * Returns the inserted documents so callers can reference their IDs.
 */
export const seedTestData = async (): Promise<SeedResult> => {
  const insertedChats: SeedResult['chats'] = [];
  const insertedMessages: SeededMessage[] = [];

  const now = Date.now();

  for (let i = 0; i < chatSeedData.length; i++) {
    const item = chatSeedData[i]!;

    // Stagger timestamps so order is deterministic in queries
    const chatTime = new Date(now - (chatSeedData.length - i) * 3_600_000);

    const { insertedId } = await Chat.collection.insertOne({
      title: item.title,
      sessionId: item.sessionId,
      status: item.status,
      createdAt: chatTime,
      updatedAt: chatTime,
    });

    insertedChats.push({
      _id: insertedId,
      title: item.title,
      sessionId: item.sessionId,
      status: item.status,
    });

    // Insert messages for this chat
    let msgTime = chatTime.getTime();
    for (const msg of item.messages) {
      msgTime += 60_000; // 1 minute apart
      const messageDoc: SeededMessage = {
        chatId: insertedId,
        role: msg.role,
        content: msg.content,
        status: msg.status,
      };
      await Message.collection.insertOne({
        ...messageDoc,
        createdAt: new Date(msgTime),
        updatedAt: new Date(msgTime),
      });
      insertedMessages.push(messageDoc);
    }
  }

  return { chats: insertedChats, messages: insertedMessages };
};
