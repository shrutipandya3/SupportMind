import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Box sx={{ width: '20%', flexShrink: 0 }}>
        <Sidebar />
      </Box>
      <Box
        component="main"
        sx={{ width: '80%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}