import { z } from 'zod';

export const getChatByIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format'),
});

// Infer the type for TypeScript
export type GetChatByIdParams = z.infer<typeof getChatByIdSchema>;

export const createChatSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(100, 'Title cannot exceed 100 characters')
    .optional()
    .default('New Chat'),
});

// Infer the type for TypeScript
export type CreateChatBody = z.infer<typeof createChatSchema>;

export const updateChatParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format'),
});

// Infer the type for TypeScript
export type UpdateChatParams = z.infer<typeof updateChatParamsSchema>;

export const updateChatBodySchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(100, 'Title cannot exceed 100 characters')
    .optional(),
});

// Infer the type for TypeScript
export type UpdateChatBody = z.infer<typeof updateChatBodySchema>;