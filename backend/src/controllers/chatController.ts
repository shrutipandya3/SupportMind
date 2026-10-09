import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Chat, type IChat, type IChatObject } from '../db/models/Chat.js';
import { Message, type IMessage } from '../db/models/Message.js';

export interface GetChatByIdParams {
  id: string;
}

export interface ErrorResponse {
  message: string;
  error?: string;
}

export interface ChatWithMessages extends IChatObject {
  messages: IMessage[];
}

/**
 * GET /api/chats
 * Returns all chats sorted by most recent (updatedAt descending)
 */
export const getChats = async (
  _req: Request,
  res: Response<IChat[] | ErrorResponse>
): Promise<void> => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1 });
    res.status(200).json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({
      message: 'Failed to fetch chats',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * GET /api/chats/:id
 * Returns the chat and its messages sorted chronologically
 */
export const getChatById = async (
  req: Request<GetChatByIdParams>,
  res: Response<ChatWithMessages | ErrorResponse>
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid chat ID format' });
      return;
    }

    const chat = await Chat.findById(id);
    if (!chat) {
      res.status(404).json({ message: 'Chat not found' });
      return;
    }

    const messages = await Message.find({ chatId: id }).sort({ createdAt: 1 });

    const chatObj = chat.toObject() as IChatObject;

    res.status(200).json({
      ...chatObj,
      messages,
    });
  } catch (error) {
    console.error('Error fetching chat by ID:', error);
    res.status(500).json({
      message: 'Failed to fetch chat',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getAllChats = getChats;
export default { getChats, getAllChats, getChatById };
