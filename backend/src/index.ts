import 'dotenv/config';
import app from './app.js';
import { connectDb } from './db/connection.js';

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  await connectDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
