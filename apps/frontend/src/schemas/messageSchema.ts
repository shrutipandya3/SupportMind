import { z } from 'zod';

export const sendMessageParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format'),
});

// Infer the type for TypeScript
export type SendMessageParams = z.infer<typeof sendMessageParamsSchema>;

export const sendMessageBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message cannot exceed 4000 characters'),
});

// Infer the type for TypeScript
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;