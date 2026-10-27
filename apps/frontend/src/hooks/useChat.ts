import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChat,
  getChatById,
  getChats,
  updateChatTitle,
  type Chat,
  type ChatByIdResponse,
} from '../api/chatService';

// Central place for query keys
export const chatKeys = {
  all: ['chats'] as const,
  detail: (id: string) => ['chats', id] as const,
};

// ---------- Queries ----------

/** All chats, most recent first */
export const useChats = () =>
  useQuery<Chat[], Error>({
    queryKey: chatKeys.all,
    queryFn: getChats,
  });

/** A single chat with its messages. Pass undefined to skip fetching. */
export const useChat = (id: string | undefined) =>
  useQuery<ChatByIdResponse, Error>({
    queryKey: chatKeys.detail(id ?? ''),
    queryFn: () => getChatById(id as string),
    enabled: !!id,
  });

// ---------- Mutations ----------

export const useCreateChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createChat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
};

export const useUpdateChatTitle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateChatTitle,
    onSuccess: (updatedChat) => {
      // Update the open chat immediately, keeping its messages
      queryClient.setQueryData<ChatByIdResponse>(chatKeys.detail(updatedChat._id), (old) =>
        old ? { ...old, chat: updatedChat } : old
      );
      // Refetch the list: updatedAt changed, so the sort order may change
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
};