import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format');

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title cannot be empty')
  .max(100, 'Title cannot exceed 100 characters');

export const chatStatusSchema = z.enum(['active', 'archived']);

/** GET /api/chats?status=active|archived */
export const getChatsQuerySchema = z.object({
  status: chatStatusSchema.optional(),
});
export type GetChatsQuery = z.infer<typeof getChatsQuerySchema>;

export const getChatByIdSchema = z.object({
  id: objectIdSchema,
});
export type GetChatByIdParams = z.infer<typeof getChatByIdSchema>;

/**
 * userId, sessionId, and ticketId are intentionally NOT accepted from the client:
 * sessionId comes from the session middleware, userId from auth,
 * and ticketId from the escalation flow.
 */
export const createChatSchema = z.object({
  title: titleSchema.optional().default('New chat'), // matches model default
});
export type CreateChatBody = z.infer<typeof createChatSchema>;

export const updateChatParamsSchema = z.object({
  id: objectIdSchema,
});
export type UpdateChatParams = z.infer<typeof updateChatParamsSchema>;

export const updateChatBodySchema = z
  .object({
    title: titleSchema.optional(),
    status: chatStatusSchema.optional(),
  })
  .refine((body) => body.title !== undefined || body.status !== undefined, {
    message: 'At least one of title or status must be provided',
  });
export type UpdateChatBody = z.infer<typeof updateChatBodySchema>;