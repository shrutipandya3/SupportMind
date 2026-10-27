import { Router } from 'express';
import { sendMessageBodySchema, sendMessageParamsSchema } from '../schemas/messageSchema.js';
import { validate } from '../middleware/validate.js';
import { sendMessage } from '../controllers/messageController.js';


const router = Router();

// POST /api/chats/:id/messages - saves the user message and streams the assistant reply (SSE)
router.post(
  '/:id/messages',
  validate({ params: sendMessageParamsSchema, body: sendMessageBodySchema }),
  sendMessage
);

export default router;