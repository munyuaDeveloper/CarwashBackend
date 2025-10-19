// Vercel serverless function entry point
import app from '../app';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const DB = process.env['DATABASE']?.replace(
      '<PASSWORD>',
      process.env['DATABASE_PASSWORD'] || ''
    ) || '';

    if (!DB) {
      throw new Error('Database connection string not found');
    }

    await mongoose.connect(DB);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize database connection
connectDB();

// Export the Express app for Vercel
export default app;
