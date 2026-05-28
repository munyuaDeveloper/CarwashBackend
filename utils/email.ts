import nodemailer from 'nodemailer';
import { IUser } from '../types';

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
};

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env['EMAIL_HOST'] || process.env['EMAIL'] || 'smtp.gmail.com';
    const user = process.env['EMAIL_USERNAME'] || process.env['EMAIL_USER'];
    const rawPass = process.env['EMAIL_PASSWORD'] || process.env['EMAIL_PASS'] || '';
    const pass =
      host.includes('gmail')
        ? rawPass.replace(/\s+/g, '')
        : rawPass;

    if (!user || !pass) {
      console.warn(
        '[email] Missing SMTP credentials. Set EMAIL_USERNAME/EMAIL_PASSWORD or EMAIL_USER/EMAIL_PASS.'
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env['EMAIL_PORT']) || 587,
      secure: process.env['EMAIL_SECURE'] === 'true',
      auth: {
        user,
        pass
      }
    });
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const message = {
      from: input.from || process.env['EMAIL_FROM'] || 'noreply@carwash.com',
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    };

    await this.transporter.sendMail(message);
  }

  async sendPasswordResetEmail(user: IUser, resetURL: string): Promise<void> {
    try {
      await this.sendEmail({
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
      });
      console.log('Password reset email sent successfully to:', user.email);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  private resolveLoginPageUrl(loginUrl?: string): string {
    const resolvedLoginUrl = loginUrl || process.env['FRONTEND_URL'] || 'http://localhost:5173';
    return `${resolvedLoginUrl.replace(/\/$/, '')}/login`;
  }

  async sendNewUserCredentialsEmail(
    recipient: { name: string; email: string },
    defaultPassword: string,
    options?: { roles?: string[]; businessName?: string; loginUrl?: string }
  ): Promise<void> {
    const loginPageUrl = this.resolveLoginPageUrl(options?.loginUrl);
    const rolesLabel =
      options?.roles && options.roles.length > 0 ? options.roles.join(', ') : 'user';
    const businessLine = options?.businessName
      ? `\nBusiness: ${options.businessName}`
      : '';
    const businessHtml = options?.businessName
      ? `<p><strong>Business:</strong> ${options.businessName}</p>`
      : '';

    try {
      await this.sendEmail({
        to: recipient.email,
        subject: options?.businessName
          ? `Welcome to WashFlow — ${options.businessName} login credentials`
          : 'Your WashFlow account — login credentials',
        text: `Hello ${recipient.name},\n\nYour account has been created on WashFlow.${businessLine}\n\nLogin email: ${recipient.email}\nDefault password: ${defaultPassword}\nRole(s): ${rolesLabel}\n\nSign in: ${loginPageUrl}\n\nPlease log in and change this password immediately.`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to WashFlow</h2>
          <p>Hello ${recipient.name},</p>
          <p>Your account has been created. Use the credentials below to sign in.</p>
          ${businessHtml}
          <p><strong>Login email:</strong> ${recipient.email}</p>
          <p><strong>Default password:</strong> ${defaultPassword}</p>
          <p><strong>Role(s):</strong> ${rolesLabel}</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${loginPageUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Sign in to WashFlow</a>
          </div>
          <p style="word-break: break-all; color: #666; font-size: 13px;">Or open: ${loginPageUrl}</p>
          <p style="margin-top: 16px;"><strong>Important:</strong> Change this password immediately after your first login.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This is an automated message from WashFlow.</p>
        </div>
      `
      });
      console.log('New user credentials email sent successfully to:', recipient.email);
    } catch (error) {
      console.error('Error sending new user credentials email:', error);
      throw new Error('Failed to send new user credentials email');
    }
  }

  async sendWelcomeEmail(user: IUser, defaultPassword?: string): Promise<void> {
    if (defaultPassword) {
      return this.sendNewUserCredentialsEmail(
        { name: user.name, email: user.email },
        defaultPassword,
        { roles: (user.roles ?? [user.role]).filter(Boolean) as string[] }
      );
    }

    try {
      await this.sendEmail({
        to: user.email,
        subject: 'Welcome to Carwash Management System',
        text: `Welcome ${user.name}! Your account has been created successfully.`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Carwash Management System</h2>
          <p>Hello ${user.name},</p>
          <p>Your account has been created successfully with role(s): <strong>${(user.roles ?? [user.role]).filter(Boolean).join(', ')}</strong></p>
          <p>You can now log in to the system and start managing carwash bookings.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">This is an automated message from the Carwash Management System.</p>
        </div>
      `
      });
      console.log('Welcome email sent successfully to:', user.email);
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }
  }

  async sendBusinessOnboardingEmail(
    businessName: string,
    recipientEmail: string,
    defaultPassword: string,
    loginUrl?: string
  ): Promise<void> {
    return this.sendNewUserCredentialsEmail(
      { name: businessName, email: recipientEmail },
      defaultPassword,
      {
        businessName,
        ...(loginUrl ? { loginUrl } : {})
      }
    );
  }
}

export default new EmailService();
