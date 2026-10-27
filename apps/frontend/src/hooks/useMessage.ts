import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sendMessage,
  type MessageDoneEvent,
  type SendMessageInput,
} from '../api/messageService';
import { chatKeys } from './useChat';

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const mutation = useMutation<MessageDoneEvent, Error, SendMessageInput>({
    mutationFn: (input) => {
      setStreamingContent('');

      return sendMessage(input, {
        onOpen: () => {
          setIsStreaming(true);
          // The user message and auto-title are already saved on the server,
          // so refetch now to show them before the reply finishes.
          queryClient.invalidateQueries({ queryKey: chatKeys.detail(input.id) });
          queryClient.invalidateQueries({ queryKey: chatKeys.all });
        },
        onChunk: (chunk) => setStreamingContent((prev) => prev + chunk),
      });
    },

    // Runs on success AND failure. Waiting for the refetch before clearing the
    // streamed text avoids a flicker between the stream and the saved message.
    onSettled: async (_data, _error, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: chatKeys.all }),
      ]);
      setIsStreaming(false);
      setStreamingContent('');
    },
  });

  return {
    sendMessage: mutation.mutate,
    sendMessageAsync: mutation.mutateAsync,
    streamingContent, // the assistant reply so far
    isStreaming, // true from stream open until the refetch finishes
    isPending: mutation.isPending, // true for the whole request
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
};