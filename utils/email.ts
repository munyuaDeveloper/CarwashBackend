import nodemailer from 'nodemailer';
import { IUser } from '../types';

// Email service for password reset functionality
class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env['EMAIL_HOST'] || 'smtp.gmail.com',
      port: Number(process.env['EMAIL_PORT']) || 587,
      secure: process.env['EMAIL_SECURE'] === 'true',
      auth: {
        user: process.env['EMAIL_USERNAME'],
        pass: process.env['EMAIL_PASSWORD']
      }
    });
  }

  async sendPasswordResetEmail(user: IUser, resetURL: string): Promise<void> {
    const message = {
      from: process.env['EMAIL_FROM'] || 'noreply@carwash.com',
      to: user.email,
      subject: 'Your password reset token (valid for 10 minutes)',
      text: `Forgot your password? Submit a PATCH request with your new password and passwordConfirm to: ${resetURL}.\n\nIf you didn't forget your password, please ignore this email!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested a password reset for your carwash account. Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetURL}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetURL}</p>
          <p><strong>This link will expire in 10 minutes.</strong></p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This is an automated message from the Carwash Management System.</p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(message);
      console.log('Password reset email sent successfully to:', user.email);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(user: IUser): Promise<void> {
    const message = {
      from: process.env['EMAIL_FROM'] || 'noreply@carwash.com',
      to: user.email,
      subject: 'Welcome to Carwash Management System',
      text: `Welcome ${user.name}! Your account has been created successfully.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Carwash Management System</h2>
          <p>Hello ${user.name},</p>
          <p>Your account has been created successfully with the role: <strong>${user.role}</strong></p>
          <p>You can now log in to the system and start managing carwash bookings.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This is an automated message from the Carwash Management System.</p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(message);
      console.log('Welcome email sent successfully to:', user.email);
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't throw error for welcome email as it's not critical
    }
  }
}

export default new EmailService();
