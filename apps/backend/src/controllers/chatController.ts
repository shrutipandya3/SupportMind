import type { NextFunction, Request, Response } from 'express';
import { Chat, type IChat, type IChatObject } from '../db/models/Chat.js';
import { Message, type IMessage } from '../db/models/Message.js';
import type {
  CreateChatBody,
  GetChatByIdParams,
  UpdateChatBody,
  UpdateChatParams,
} from '../schemas/chatSchema.js';
import { createHttpError } from '../middleware/errorHandler.js';

export interface GetChatsResponse {
  chats: IChatObject[];
}

/**
 * GET /api/chats
 * Returns all chats sorted by most recent (updatedAt descending)
 */
export const getChats = async (
  _req: Request,
  res: Response<GetChatsResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1 });
    res.status(200).json({ chats });
  } catch (error) {
    next(error);
  }
};

export interface ChatByIdResponse {
  chat: IChat;
  messages: IMessage[];
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

    const chat = await Chat.findById(id);
    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    const messages = await Message.find({ chatId: id }).sort({ createdAt: 1 });

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
 * Creates a new chat (defaults to the title 'New Chat')
 */
export const createChat = async (
  req: Request<{}, CreateChatResponse, CreateChatBody>,
  res: Response<CreateChatResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const title = req.body.title || 'New Chat';

    const chat = new Chat({ title });
    await chat.save();

    res.status(201).json({ chat });
  } catch (error) {
    next(error);
  }
};

export interface UpdateChatResponse {
  chat: IChat;
}

/**
 * PATCH /api/chats/:id
 * Updates an existing chat's title
 */
export const updateChatTitle = async (
  req: Request<UpdateChatParams, UpdateChatResponse, UpdateChatBody>,
  res: Response<UpdateChatResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    const chat = await Chat.findByIdAndUpdate(
      id,
      { title: title.trim() },
      { returnDocument: 'after', runValidators: true }
    );

    if (!chat) {
      next(createHttpError(404, 'Chat not found'));
      return;
    }

    res.status(200).json({ chat });
  } catch (error) {
    next(error);
  }
};