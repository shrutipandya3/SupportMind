import mongoose from 'mongoose';

const uri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/test_db';

(async () => {
  try {
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase(); // deletes existing test_db
    console.log(`Dropped database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('Failed to reset test database:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();