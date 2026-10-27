import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useMatch } from 'react-router-dom';
import { useChats } from '../../hooks/useChat';

export default function ChatHistoryList() {
  // Active chat = the one in the URL. On "/" nothing matches, so nothing is active.
  const activeId = useMatch('/chat/:id')?.params.id;
  const { data: chats, isLoading, isError, error, refetch } = useChats();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        sx={{ m: 2 }}
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }

  if (!chats || chats.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No chats yet.
      </Typography>
    );
  }

  return (
    <List disablePadding sx={{ px: 1 }}>
      {chats.map((chat) => {
        const isActive = chat._id === activeId;
        return (
          <Tooltip key={chat._id} title={chat.title} placement="right" enterDelay={400}>
            <ListItemButton
              component={RouterLink}
              to={`/chat/${chat._id}`}
              selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <Typography noWrap>{chat.title}</Typography>
            </ListItemButton>
          </Tooltip>
        );
      })}
    </List>
  );
}