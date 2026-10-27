import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#99582a',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ffe6a7',
      contrastText: '#432818',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Roboto, "Segoe UI", system-ui, sans-serif',
  },
});

export default theme;
