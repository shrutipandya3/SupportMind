import { z } from 'zod';
import { api } from './apiClient';
import type {
  createChatSchema,
  UpdateChatBody,
  UpdateChatParams,
} from '../schemas/chatSchema';

// ---------- Serialized types (what actually arrives over HTTP) ----------
// Mongoose documents are JSON-serialized: ObjectIds become strings, Dates become ISO strings.

export interface Chat {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | (string & {});

export interface Message {
  _id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  __v?: number;
}

// ---------- Response shapes (mirror the controller) ----------

interface GetChatsResponse {
  chats: Chat[];
}

export interface ChatByIdResponse {
  chat: Chat;
  messages: Message[];
}

interface CreateChatResponse {
  chat: Chat;
}

interface UpdateChatResponse {
  chat: Chat;
}

// ---------- Input types ----------
// z.input keeps `title` optional (the server applies the 'New Chat' default).
export type CreateChatInput = z.input<typeof createChatSchema>;

export interface UpdateChatTitleInput extends UpdateChatParams, UpdateChatBody {}

// ---------- API calls ----------

/** GET /chats - all chats, most recently updated first */
export const getChats = async (): Promise<Chat[]> => {
  const { chats } = await api.get<GetChatsResponse>('/chats');
  return chats;
};

/** GET /chats/:id - the chat and its messages in chronological order */
export const getChatById = (id: string): Promise<ChatByIdResponse> =>
  api.get<ChatByIdResponse>(`/chats/${id}`);

/** POST /chats - create a chat (title is optional, defaults to 'New Chat') */
export const createChat = async (data: CreateChatInput = {}): Promise<Chat> => {
  const { chat } = await api.post<CreateChatResponse, CreateChatInput>('/chats', data);
  return chat;
};

/** PATCH /chats/:id - rename a chat */
export const updateChatTitle = async ({ id, title }: UpdateChatTitleInput): Promise<Chat> => {
  const { chat } = await api.patch<UpdateChatResponse, UpdateChatBody>(`/chats/${id}`, { title });
  return chat;
};