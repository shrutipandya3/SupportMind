import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import type { Chat, ChatsResponse } from '../types/chat';

/** Fetches all chats sorted by most recent (GET /api/chats) */
const fetchChats = async (): Promise<Chat[]> => {
  const { data } = await apiClient.get<ChatsResponse>('/api/chats');
  return data?.chats || [];
};

export const useChats = () => {
  return useQuery<Chat[], Error>({
    queryKey: ['chats'],
    queryFn: fetchChats,
    staleTime: 30_000, // 30 s before re-fetch in background
  });
};
