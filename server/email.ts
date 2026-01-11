import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

export async function sendWelcomeEmail(to: string, firstName: string): Promise<boolean> {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log("[email] SMTP not configured, skipping welcome email");
      return false;
    }

    await transporter.sendMail({
      from: `"SceptView Network Monitor" <${fromEmail}>`,
      to,
      subject: "Welcome to SceptView Network Monitor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to SceptView Network Monitor!</h1>
          <p>Hello ${firstName || "there"},</p>
          <p>Your account has been created successfully. You can now sign in to access the network monitoring dashboard.</p>
          <p>As a new user, you have <strong>viewer</strong> access by default. Contact an administrator if you need additional permissions.</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
            <h3 style="margin-top: 0;">What you can do:</h3>
            <ul>
              <li>View real-time device status across all sites</li>
              <li>Monitor bandwidth utilization</li>
              <li>Access activity logs and performance history</li>
            </ul>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This is an automated message from SceptView Network Monitor.</p>
        </div>
      `,
    });

    console.log(`[email] Welcome email sent to ${to}`);
    return true;
  } catch (error: any) {
    console.error(`[email] Failed to send welcome email to ${to}:`, error.message);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, resetToken: string, baseUrl: string): Promise<boolean> {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log("[email] SMTP not configured, skipping password reset email");
      return false;
    }

    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: `"SceptView Network Monitor" <${fromEmail}>`,
      to,
      subject: "Reset Your Password - SceptView Network Monitor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Password Reset Request</h1>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #2563eb; font-size: 14px;">${resetUrl}</p>
          <div style="margin-top: 30px; padding: 15px; background-color: #fef3c7; border-radius: 6px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>Note:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
            </p>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">This is an automated message from Network Monitor Dashboard.</p>
        </div>
      `,
    });

    console.log(`[email] Password reset email sent to ${to}`);
    return true;
  } catch (error: any) {
    console.error(`[email] Failed to send password reset email to ${to}:`, error.message);
    return false;
  }
}

export async function sendAccountDeletionEmail(to: string, firstName: string): Promise<boolean> {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.log("[email] SMTP not configured, skipping account deletion email");
      return false;
    }

    await transporter.sendMail({
      from: `"SceptView Network Monitor" <${fromEmail}>`,
      to,
      subject: "Account Deleted - SceptView Network Monitor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Account Deleted</h1>
          <p>Hello ${firstName || "there"},</p>
          <p>Your SceptView Network Monitor account has been successfully deleted. All your data has been removed from our system.</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #fef2f2; border-radius: 8px;">
            <p style="margin: 0; color: #991b1b;">
              If you did not request this deletion, please contact the system administrator immediately.
            </p>
          </div>
          <p>If you wish to use SceptView Network Monitor again in the future, you can create a new account.</p>
          <p style="color: #6b7280; font-size: 14px;">This is an automated message from SceptView Network Monitor.</p>
        </div>
      `,
    });

    console.log(`[email] Account deletion email sent to ${to}`);
    return true;
  } catch (error: any) {
    console.error(`[email] Failed to send account deletion email to ${to}:`, error.message);
    return false;
  }
}

export async function testEmailConnection(): Promise<{ success: boolean; message: string }> {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      return { success: false, message: "SMTP credentials not configured" };
    }

    await transporter.verify();
    return { success: true, message: "SMTP connection successful" };
  } catch (error: any) {
    return { success: false, message: error.message || "SMTP connection failed" };
  }
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      return { success: false, message: "SMTP not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables." };
    }

    await transporter.sendMail({
      from: `"SceptView Network Monitor" <${fromEmail}>`,
      to,
      subject: "Test Email - SceptView Network Monitor SMTP Configuration",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #22c55e;">SMTP Configuration Test Successful</h1>
          <p>This is a test email from your SceptView Network Monitor.</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #dcfce7; border-radius: 8px; border-left: 4px solid #22c55e;">
            <p style="margin: 0; color: #166534;">
              <strong>Your email notifications are working correctly!</strong>
            </p>
          </div>
          <p>You will receive alerts for:</p>
          <ul>
            <li>Device offline events</li>
            <li>Device recovery events</li>
            <li>High bandwidth utilization warnings</li>
          </ul>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            Sent at: ${new Date().toLocaleString()}
          </p>
          <p style="color: #6b7280; font-size: 14px;">This is an automated test message from Network Monitor Dashboard.</p>
        </div>
      `,
    });

    console.log(`[email] Test email sent successfully to ${to}`);
    return { success: true, message: `Test email sent successfully to ${to}` };
  } catch (error: any) {
    console.error(`[email] Failed to send test email to ${to}:`, error.message);
    return { success: false, message: error.message || "Failed to send test email" };
  }
}
