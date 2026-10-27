import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format');

export const sendMessageParamsSchema = z.object({
  id: objectIdSchema,
});
export type SendMessageParams = z.infer<typeof sendMessageParamsSchema>;

/**
 * Only `content` is accepted from the client. role, status, replyType, sources,
 * toolCalls, model, guardrailFlag, errorMessage and feedback are set by the server.
 */
export const sendMessageBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message cannot exceed 4000 characters'),
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;