import { z } from 'zod';

export const getChatByIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid chat ID format'),
});

// Infer the type for TypeScript
export type GetChatByIdParams = z.infer<typeof getChatByIdSchema>;