import { Router } from 'express';
import { createChat, getChatById, getChats, updateChatTitle } from '../controllers/chatController.js';
import { validate } from '../middleware/validate.js';
import { createChatSchema, getChatByIdSchema, updateChatBodySchema, updateChatParamsSchema } from '../schemas/chatSchema.js';

const router = Router();

// GET /api/chats - returns all chats sorted by most recent
router.get('/', getChats);

// GET /api/chats/:id - returns the chat and its messages
router.get('/:id', validate({ params: getChatByIdSchema }), getChatById);

// POST /api/chats - creates a new chat
router.post('/', validate({ body: createChatSchema }), createChat);

// PATCH /api/chats/:id - updates an existing chat's title
router.patch(
  '/:id',
  validate({ params: updateChatParamsSchema, body: updateChatBodySchema }),
  updateChatTitle
);

export default router;
