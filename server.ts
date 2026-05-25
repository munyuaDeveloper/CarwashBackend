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

const port = process.env['PORT'] || 3000;
let server: ReturnType<typeof app.listen>;

mongoose
  .connect(DB)
  .then(() => {
    console.log('DB connection successful!');
    startWalletResetCronJob();

    server = app.listen(port, () => {
      console.log(`App running on port ${port}...`);
      console.log(`TextSMS webhook: http://localhost:${port}/api/v1/webhooks/textsms/callback`);
    });
  })
  .catch((err: Error) => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  });

process.on('unhandledRejection', (err: Error) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  if (server) {
    server.close(() => {
      console.log('💥 Process terminated!');
    });
  }
});
