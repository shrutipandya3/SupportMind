import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Skeleton,
  Snackbar,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useChat, useCreateChat } from '../hooks/useChat';
import { useSendMessage } from '../hooks/useMessage';
import ChatTitle from '../components/MainArea/ChatTitle';
import MessageList from '../components/MainArea/MessageList';
import ChatInput from '../components/MainArea/ChatInput';


const SLIDE_MS = 500;

/** A send that is in flight, tied to the chat it belongs to */
interface PendingSend {
  chatId: string;
  content: string;
  /** Message count before sending, used to know when the server copy has arrived */
  baseCount: number;
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useChat(id);
  const { mutateAsync: createChatAsync } = useCreateChat();
  const { sendMessageAsync, streamingContent, isStreaming } = useSendMessage();

  const [pending, setPending] = useState<PendingSend | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const messages = data?.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  const hasConversation = !!id; // false on "/", true on "/chat/:id"
  const isBusy = isSending || isStreaming;

  // Only show in-flight UI on the chat it belongs to
  const pendingHere = pending && pending.chatId === id ? pending : null;
  const showPendingQuestion = !!pendingHere && messages.length <= pendingHere.baseCount;
  const showStreamingAnswer = !!pendingHere && streamingContent.length > 0;
  const showThinking =
    !!pendingHere &&
    streamingContent.length === 0 &&
    (showPendingQuestion || lastMessage?.role === 'user');

  // ---------- Scrolling: follow new content unless the user scrolled up ----------

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    stickToBottom.current = true; // new chat opened: start at the bottom
  }, [id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [id, messages.length, streamingContent, showPendingQuestion, showThinking]);

  // ---------- Sending ----------

  const handleSend = async (content: string) => {
    setSendError(null);
    setIsSending(true);
    stickToBottom.current = true;

    try {
      let chatId = id;
      if (!chatId) {
        // First message: create the chat, move to its URL, then stream the reply.
        // ChatPage stays mounted across this navigation, so the stream is not lost.
        const chat = await createChatAsync({});
        chatId = chat._id;
        setPending({ chatId, content, baseCount: 0 });
        navigate(`/chat/${chatId}`);
      } else {
        setPending({ chatId, content, baseCount: messages.length });
      }
      await sendMessageAsync({ id: chatId, content });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(null);
      setIsSending(false);
    }
  };

  // ---------- Render ----------

  let titleNode: React.ReactNode = null;
  if (!id) {
    titleNode = <Typography variant="h6">New Chat</Typography>;
  } else if (data) {
    // key resets the edit state when switching chats
    titleNode = <ChatTitle key={data.chat._id} chat={data.chat} />;
  } else if (!isError) {
    titleNode = <Skeleton width={200} height={32} />;
  }

  let body: React.ReactNode;
  if (id && isLoading && !pendingHere) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  } else if (id && isError && !pendingHere) {
    body = (
      <Alert
        severity="error"
        sx={{ my: 3 }}
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        {error?.message ?? 'Could not load this chat'}
      </Alert>
    );
  } else {
    body = (
      <MessageList
        messages={messages}
        pendingQuestion={showPendingQuestion ? pendingHere?.content : undefined}
        streamingAnswer={showStreamingAnswer ? streamingContent : undefined}
        thinking={showThinking}
      />
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Title bar */}
      <Box
        sx={{
          px: 3,
          minHeight: 64,
          display: 'flex',
          borderBottom: 1,          
          borderColor: 'divider',
          alignItems: 'center',
        }}
      >
        <Box sx={{ width: '60%', minWidth: 0 }}>{titleNode}</Box>
      </Box>

      {/* Messages — fills all remaining height; scrollbar track reserved full-height */}
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          flexBasis: 0,
          minHeight: 0,
          overflowY: 'scroll', // always reserve the track lane → no layout jank on content arrival
          px: 3,
        }}
      >
        {body}
      </Box>

      {/* Input */}
      <Box sx={{ flexShrink: 0, px: 3, pt: 1, pb: 2, display: 'flex', justifyContent: 'center' }}>
        <ChatInput onSend={handleSend} disabled={isBusy} />
      </Box>

      {/* Flexible space BELOW the input.
          Empty state: grow 1 vs. 1 above, so the input sits in the vertical middle.
          After the first message: grow 0, so the input slides to the bottom. */}
      <Box
        aria-hidden
        sx={{
          flexGrow: hasConversation ? 0 : 1,
          flexBasis: 0,
          transition: `flex-grow ${SLIDE_MS}ms ease`,
        }}
      />

      <Snackbar open={!!sendError} autoHideDuration={6000} onClose={() => setSendError(null)}>
        <Alert severity="error" onClose={() => setSendError(null)}>
          {sendError}
        </Alert>
      </Snackbar>
    </Box>
  );
}