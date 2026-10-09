import express from 'express';
import corsMiddleware from './cors.js';

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is healthy', timestamp: new Date().toISOString() });
});

export default app;
