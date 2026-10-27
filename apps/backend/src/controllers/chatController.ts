import type { NextFunction, Request, Response } from 'express';
import { Chat, type IChat, type IChatObject } from '../db/models/Chat.js';
import { Message, type IMessageObject } from '../db/models/Message.js';
import type {
  CreateChatBody,
  GetChatByIdParams,
  GetChatsQuery,
  UpdateChatBody,
  UpdateChatParams,
} from '../schemas/chatSchema.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { getSessionId } from '../middleware/session.js';

export interface GetChatsResponse {
  chats: IChatObject[];
}

/**
 * GET /api/chats?status=active|archived
 * Returns the current session's chats (default: active), most recent first
 */
export const getChats = async (
  req: Request<{}, GetChatsResponse, {}, GetChatsQuery>,
  res: Response<GetChatsResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    // No session cookie yet → visitor hasn't started a chat; return empty list.
    if (!req.sessionId) {
      res.status(200).json({ chats: [] });
      return;
    }

    const sessionId = req.sessionId;
    const status = req.query.status ?? 'active';

    // Uses the { sessionId: 1, updatedAt: -1 } index
    const chats = await Chat.find({ sessionId, status })
      .sort({ updatedAt: -1 })
      .lean<IChatObject[]>();

    res.status(200).json({ chats });
  } catch (error) {
    next(error);
  }
};

export interface ChatByIdResponse {
  chat: IChatObject;
  messages: IMessageObject[];
}

/**
 * GET /api/chats/:id
 * Returns the chat and its messages sorted chronologically
 */
export const getChatById = async (
  req: Request<GetChatByIdParams>,
  res: Response<ChatByIdResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const sessionId = getSessionId(req);

    // Scoped to session: other sessions' chats are indistinguishable from missing
    const chat = await Chat.findOne({ _id: id, sessionId }).lean<IChatObject>();
    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    // Uses the { chatId: 1, createdAt: 1 } index
    const messages = await Message.find({ chatId: chat._id })
      .sort({ createdAt: 1 })
      .lean<IMessageObject[]>();

    res.status(200).json({ chat, messages });
  } catch (error) {
    next(error);
  }
};

export interface CreateChatResponse {
  chat: IChat;
}

/**
 * POST /api/chats
 * Creates a new chat (title defaults to 'New chat', status to 'active')
 */
export const createChat = async (
  req: Request<{}, CreateChatResponse, CreateChatBody>,
  res: Response<CreateChatResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req); // set by ensureSession (new or existing)

    // If title is undefined, the model default ('New chat') applies
    const chat = new Chat({ title: req.body.title, sessionId });
    await chat.save();

    res.status(201).json({ chat });
  } catch (error) {
    next(error);
  }
};

export interface UpdateChatResponse {
  chat: IChatObject;
}

/**
 * PATCH /api/chats/:id
 * Updates an existing chat's title and/or status (archive / unarchive)
 */
export const updateChat = async (
  req: Request<UpdateChatParams, UpdateChatResponse, UpdateChatBody>,
  res: Response<UpdateChatResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, status } = req.body;
    const sessionId = getSessionId(req);

    // Build the update explicitly so nothing else can be changed through this route
    const update: Partial<Pick<IChat, 'title' | 'status'>> = {};
    if (title !== undefined) update.title = title.trim();
    if (status !== undefined) update.status = status;

    const chat = await Chat.findOneAndUpdate({ _id: id, sessionId }, update, {
      returnDocument: 'after',
      runValidators: true,
    }).lean<IChatObject>();

    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    res.status(200).json({ chat });
  } catch (error) {
    next(error);
  }
};