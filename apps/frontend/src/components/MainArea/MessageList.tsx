import { Box, CircularProgress } from '@mui/material';
import AnswerBox from './AnswerBox';
import QuestionBox from './QuestionBox';
import type { Message } from '../../api/chatService';
import { CONTENT_WIDTH } from '../layout/messageLayout';

interface MessageListProps {
  messages: Message[];
  /** User message shown before the server copy has been refetched */
  pendingQuestion?: string;
  /** Assistant reply streamed so far */
  streamingAnswer?: string;
  /** Waiting for the first chunk */
  thinking?: boolean;
}

export default function MessageList({
  messages,
  pendingQuestion,
  streamingAnswer,
  thinking,
}: MessageListProps) {
  return (
    <Box
      sx={{
        width: CONTENT_WIDTH,
        maxWidth: '100%',
        mx: 'auto',
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {messages.map((m) => {
        if (m.role === 'user') return <QuestionBox key={m._id} content={m.content} />;
        if (m.role === 'assistant') return <AnswerBox key={m._id} content={m.content} />;
        return null; // system messages are not rendered
      })}

      {pendingQuestion && <QuestionBox content={pendingQuestion} />}
      {streamingAnswer && <AnswerBox content={streamingAnswer} />}
      {thinking && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={20} aria-label="Waiting for reply" />
        </Box>
      )}
    </Box>
  );
}