import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import NewChat from './pages/NewChat';
import ExistingChat from './pages/ExistingChat';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />, // Main shell with sidebar
    children: [
      {
        index: true,
        element: <NewChat />, // Matches "/"
      },
      {
        path: 'chat/:id',
        element: <ExistingChat />, // Matches "/chat/:id"
      },
    ],
  },
];

export const router = createBrowserRouter(routes);