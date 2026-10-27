import { useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Snackbar, TextField, Typography } from '@mui/material';
import { useUpdateChatTitle } from '../../hooks/useChat';
import type { Chat } from '../../api/chatService';


interface ChatTitleProps {
  chat: Chat;
}

export default function ChatTitle({ chat }: ChatTitleProps) {
  const { mutate, isPending, variables, isError, error, reset } = useUpdateChatTitle();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);

  // Enter/Escape unmount the input, which can also fire blur.
  // This guard makes sure we only save or cancel once per edit session.
  const finishedRef = useRef(false);

  const startEditing = () => {
    finishedRef.current = false;
    setDraft(chat.title);
    setIsEditing(true);
  };

  const cancel = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsEditing(false);
  };

  const save = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsEditing(false);

    const title = draft.trim();
    if (!title || title === chat.title) return; // empty or unchanged: just revert
    mutate({ id: chat._id, title });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // don't hijack IME confirmation
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  // While the request is in flight, show the new title instead of flashing the old one.
  // If it fails, this falls back to chat.title, which reverts the display.
  const displayTitle = isPending && variables ? variables.title : chat.title;

  return (
    <>
      {isEditing ? (
        <TextField
          variant="standard"
          fullWidth
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          onFocus={(e) => e.target.select()}
          sx={{ '& input': { fontSize: '1.25rem', fontWeight: 500 } }}
        />
      ) : (
        <Typography
          variant="h6"
          noWrap
          onDoubleClick={startEditing}
          title={displayTitle}
          sx={{ cursor: 'text' }}
        >
          {displayTitle}
        </Typography>
      )}

      <Snackbar open={isError} autoHideDuration={5000} onClose={reset}>
        <Alert severity="error" onClose={reset}>
          {error?.message ?? 'Could not rename chat'}
        </Alert>
      </Snackbar>
    </>
  );
}