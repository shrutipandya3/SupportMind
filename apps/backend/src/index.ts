import 'dotenv/config';
import app from './app.js';
import { connectDb } from './db/connection.js';
import { registerPrompts } from './services/promptService.js';

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  await connectDb();
  await registerPrompts();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
