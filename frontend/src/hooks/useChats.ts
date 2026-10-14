import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import type { Chat } from '../types/chat';

/** Fetches all chats sorted by most recent (GET /api/chats) */
const fetchChats = async (): Promise<Chat[]> => {
  const { data } = await apiClient.get<Chat[]>('/api/chats');
  return data;
};

export const useChats = () => {
  return useQuery<Chat[], Error>({
    queryKey: ['chats'],
    queryFn: fetchChats,
    staleTime: 30_000, // 30 s before re-fetch in background
  });
};
