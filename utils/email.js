const { Resend } = require('resend');

// Initialize Resend with API Key
// Make sure RESEND_API_KEY is set in your .env file
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an email using Resend
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML body
 * @returns {Promise<boolean>} - True if sent successfully, false otherwise
 */
const sendEmail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev', // Use 'onboarding@resend.dev' for testing if you haven't verified a domain
      to: to,
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('❌ Error sending email with Resend:', error);
      return false;
    }

    console.log(`✅ Email sent to ${to}: ${data.id}`);
    return true;
  } catch (error) {
    console.error(`❌ Unexpected error sending email: ${error.message}`);
    return false;
  }
};

// Send activation email
const sendActivationEmail = async (email, firstName, activationToken) => {
  const activationUrl = `${process.env.FRONTEND_URL}/activate/${activationToken}`;

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Google Drive Clone!</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Thank you for registering! We're excited to have you on board.</p>
            <p>To activate your account and start storing your files securely, please click the button below:</p>
            <div style="text-align: center;">
              <a href="${activationUrl}" class="button">Activate My Account</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${activationUrl}</p>
            <p><strong>Note:</strong> This activation link will expire in 24 hours.</p>
            <p>If you didn't create this account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2026 Google Drive Clone. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

  return sendEmail(email, 'Activate Your Google Drive Clone Account', html);
};

// Send password reset email
const sendPasswordResetEmail = async (email, firstName, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #f5576c; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>We received a request to reset your password for your Google Drive Clone account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset My Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #f5576c;">${resetUrl}</p>
            <div class="warning">
              <strong>⚠️ Important:</strong>
              <ul>
                <li>This link will expire in 24 hours</li>
                <li>This link can only be used once</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>© 2026 Google Drive Clone. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

  return sendEmail(email, 'Reset Your Password - Google Drive Clone', html);
};

module.exports = {
  sendActivationEmail,
  sendPasswordResetEmail
};
