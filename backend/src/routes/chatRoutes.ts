import { Router } from 'express';
import { getChats, getChatById } from '../controllers/chatController.js';

const router = Router();

// GET /api/chats - returns all chats sorted by most recent
router.get('/', getChats);

// GET /api/chats/:id - returns the chat and its messages
router.get('/:id', getChatById);

export default router;
