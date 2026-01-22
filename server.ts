import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './app';
import { startWalletResetCronJob } from './utils/cronJobs';

process.on('uncaughtException', (err: Error) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: './config.env' });

const DB = process.env['DATABASE']?.replace(
  '<PASSWORD>',
  process.env['DATABASE_PASSWORD'] || ''
) || '';

mongoose.connect(DB).then(() => {
  console.log('DB connection successful!');
  // Start cron job after database connection is established
  startWalletResetCronJob();
});

const port = process.env['PORT'] || 3000;
const server = app.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

process.on('unhandledRejection', (err: Error) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});
