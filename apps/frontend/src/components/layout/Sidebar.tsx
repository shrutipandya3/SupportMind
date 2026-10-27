import { Box, Button, Divider, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Link as RouterLink } from 'react-router-dom';
import ChatHistoryList from '../Sidebar/ChatHistoryList';

export default function Sidebar() {
  return (
    <Box
      component="aside"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          SupportMind
        </Typography>
        <Button
          fullWidth
          variant="contained"
          startIcon={<AddIcon />}
          component={RouterLink}
          to="/"
        >
          New Chat
        </Button>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        <ChatHistoryList />
      </Box>
    </Box>
  );
}