import { Router } from 'express';
import { sendMessageBodySchema, sendMessageParamsSchema } from '../schemas/messageSchema.js';
import { validate } from '../middleware/validate.js';
import { sendMessage } from '../controllers/messageController.js';
import { requireSession } from '../middleware/session.js';


const router: Router = Router();

// POST /api/chats/:id/messages - saves the user message and streams the assistant reply (SSE)
router.post(
  '/:id/messages',
  requireSession,
  validate({ params: sendMessageParamsSchema, body: sendMessageBodySchema }),
  sendMessage
);

export default router;