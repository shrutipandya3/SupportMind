import { Router } from 'express';
import { createChat, getChatById, getChats, updateChat } from '../controllers/chatController.js';
import { validate } from '../middleware/validate.js';
import { createChatSchema, getChatByIdSchema, updateChatBodySchema, updateChatParamsSchema } from '../schemas/chatSchema.js';
import { ensureSession, optionalSession, requireSession } from '../middleware/session.js';

const router: Router = Router();

// GET /api/chats - returns all chats sorted by most recent
router.get('/', optionalSession, getChats);

// GET /api/chats/:id - returns the chat and its messages
router.get('/:id', requireSession, validate({ params: getChatByIdSchema }), getChatById);

// POST /api/chats - creates a new chat
router.post('/', ensureSession, validate({ body: createChatSchema }), createChat);

// PATCH /api/chats/:id - updates an existing chat's title
router.patch(
  '/:id',
  requireSession, validate({ params: updateChatParamsSchema, body: updateChatBodySchema }),
  updateChat
);

export default router;
