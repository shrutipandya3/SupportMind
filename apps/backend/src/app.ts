import express from 'express';
import corsMiddleware from './cors.js';
import chatRoutes from './routes/chatRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/chats', chatRoutes);
app.use('/api/chats', messageRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy', timestamp: new Date().toISOString() });
});

// 1. Catch-all route for undefined endpoints (404)
app.use(notFoundHandler);

// 2. Global Error Handling Middleware
app.use(errorHandler);

export default app;
