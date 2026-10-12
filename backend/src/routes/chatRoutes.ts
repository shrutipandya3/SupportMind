import { Router } from 'express';
import { getChatById, getChats } from '../controllers/chatController.js';
import { validate } from '../middleware/validate.js';
import { getChatByIdSchema } from '../schemas/chatSchema.js';

const router = Router();

// GET /api/chats - returns all chats sorted by most recent
router.get('/', getChats);

// GET /api/chats/:id - returns the chat and its messages
router.get('/:id', validate({ params: getChatByIdSchema }), getChatById);

export default router;
