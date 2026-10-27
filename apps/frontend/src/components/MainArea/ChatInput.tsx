import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IconButton, InputAdornment, OutlinedInput } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { CONTENT_WIDTH } from '../layout/messageLayout';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !disabled && value.trim().length > 0;

  // A disabled textarea loses focus, so take it back when the reply is finished
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const submit = () => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // don't hijack IME confirmation
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    // Shift+Enter falls through and inserts a newline
  };

  return (
    <OutlinedInput
      multiline
      minRows={1}
      maxRows={8}
      placeholder="Message SupportMind"
      value={value}
      disabled={disabled}
      inputRef={inputRef}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      endAdornment={
        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 0.5 }}>
          <IconButton aria-label="Send message" onClick={submit} disabled={!canSend} edge="end">
            <SendIcon />
          </IconButton>
        </InputAdornment>
      }
      sx={{ width: CONTENT_WIDTH, maxWidth: '100%', borderRadius: 3 }}
    />
  );
}