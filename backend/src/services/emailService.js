const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { promisify } = require("util");

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      console.warn("⚠️  EMAIL_USER or EMAIL_PASS not set — emails will be logged to console only");
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // STARTTLS
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      await this.transporter.verify();
      console.log("✅ Email service initialized successfully");
    } catch (error) {
      console.error("❌ Email service initialization failed:", error);
      this.transporter = null;
    }
  }

  /**
   * Generate a cryptographically secure random token
   * @param {number} length - Token length in bytes
   * @returns {string} - Hex encoded token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Generate email verification token with expiration
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {Object} - Token and expiration info
   */
  generateEmailVerificationToken(userId, email) {
    const token = this.generateSecureToken(32);
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hours expiration

    return {
      token,
      expires,
      // Create a signed token for additional security
      signedToken: crypto
        .createHmac("sha256", process.env.JWT_SECRET || "your-secret-key")
        .update(`${userId}:${email}:${token}`)
        .digest("hex"),
    };
  }

  /**
   * Verify email verification token
   * @param {string} token - Token to verify
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @param {string} signedToken - Signed token from database
   * @returns {boolean} - Whether token is valid
   */
  verifyEmailToken(token, userId, email, signedToken) {
    try {
      const expectedSignedToken = crypto
        .createHmac("sha256", process.env.JWT_SECRET || "your-secret-key")
        .update(`${userId}:${email}:${token}`)
        .digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(signedToken, "hex"),
        Buffer.from(expectedSignedToken, "hex"),
      );
    } catch (error) {
      console.error("Token verification error:", error);
      return false;
    }
  }

  /**
   * Send email verification email
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} verificationToken - Verification token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Email send result
   */
  async sendVerificationEmail(email, name, verificationToken, userId) {
    const verificationUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email?token=${verificationToken}&userId=${userId}`;

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: "Verify Your Email - MTC Business",
      html: this.getVerificationEmailTemplate(name, verificationUrl),
      text: this.getVerificationEmailText(name, verificationUrl),
    };

    try {
      if (!this.transporter) {
        // Fallback to console logging in development
        console.log("📧 Email verification would be sent to:", email);
        console.log("🔗 Verification URL:", verificationUrl);
        return {
          success: true,
          messageId: "console-log",
          previewUrl: null,
        };
      }

      const result = await this.transporter.sendMail(mailOptions);

      // Get preview URL for development
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return {
        success: true,
        messageId: result.messageId,
        previewUrl,
      };
    } catch (error) {
      console.error("Email send error:", error);
      throw new Error("Failed to send verification email");
    }
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} resetToken - Reset token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Email send result
   */
  async sendPasswordResetEmail(email, name, resetToken, userId) {
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}&userId=${userId}`;

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: "Reset Your Password - MTC Business",
      html: this.getPasswordResetEmailTemplate(name, resetUrl),
      text: this.getPasswordResetEmailText(name, resetUrl),
    };

    try {
      if (!this.transporter) {
        console.log("📧 Password reset email would be sent to:", email);
        console.log("🔗 Reset URL:", resetUrl);
        return {
          success: true,
          messageId: "console-log",
          previewUrl: null,
        };
      }

      const result = await this.transporter.sendMail(mailOptions);

      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return {
        success: true,
        messageId: result.messageId,
        previewUrl,
      };
    } catch (error) {
      console.error("Password reset email send error:", error);
      throw new Error("Failed to send password reset email");
    }
  }

  /**
   * Get HTML template for verification email
   */
  getVerificationEmailTemplate(name, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - MTC Business</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #1a1a2e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .security-note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to MTC Business! 🚀</h1>
          <p>Your journey starts here</p>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>Thank you for creating an account with MTC Business. To complete your registration and start exploring our services, please verify your email address.</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
          
          <div class="security-note">
            <strong>Security Note:</strong> This verification link will expire in 24 hours for your security. If you didn't create an account with MTC Business, please ignore this email.
          </div>
          
          <p>Once verified, you'll be able to:</p>
          <ul>
            <li>Discover amazing places and events</li>
            <li>Book tours and experiences</li>
            <li>Get personalized recommendations</li>
            <li>Connect with local guides</li>
          </ul>
        </div>
        <div class="footer">
          <p>© 2024 Visit Namibia. All rights reserved.</p>
          <p>This email was sent to ${email}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get text template for verification email
   */
  getVerificationEmailText(name, verificationUrl) {
    return `
Welcome to MTC Business! 🚀

Hello ${name},

Thank you for creating an account with MTC Business. To complete your registration and start exploring our services, please verify your email address.

Click this link to verify: ${verificationUrl}

This verification link will expire in 24 hours for your security.

Once verified, you'll be able to:
- Discover amazing places and events
- Book tours and experiences  
- Get personalized recommendations
- Connect with local guides

If you didn't create an account with MTC Business, please ignore this email.

© 2024 MTC Business. All rights reserved.
    `;
  }

  /**
   * Get HTML template for password reset email
   */
  getPasswordResetEmailTemplate(name, resetUrl) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password - MTC Business</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #1a1a2e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .security-note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset - MTC Business</h1>
          <p>Secure your account</p>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>We received a request to reset your password for your MTC Business account.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
          
          <div class="security-note">
            <strong>Security Note:</strong> This reset link will expire in 1 hour for your security. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
          </div>
        </div>
        <div class="footer">
          <p>© 2024 MTC Business. All rights reserved.</p>
          <p>This email was sent to ${email}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get text template for password reset email
   */
  getPasswordResetEmailText(name, resetUrl) {
    return `
Password Reset - MTC Business

Hello ${name},

We received a request to reset your password for your MTC Business account.

Click this link to reset your password: ${resetUrl}

This reset link will expire in 1 hour for your security.

If you didn't request a password reset, please ignore this email and your password will remain unchanged.

© 2024 MTC Business. All rights reserved.
    `;
  }

  /**
   * Send OTP (One-Time Password) email
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} otpCode - OTP code to send
   * @returns {Promise<Object>} - Email send result
   */
  async sendOTPEmail(email, name, otpCode) {
    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: "Your OTP Code - MTC Business",
      html: this.getOTPEmailTemplate(name, otpCode),
      text: this.getOTPEmailText(name, otpCode),
    };

    try {
      if (!this.transporter) {
        // Fallback to console logging in development
        console.log(`📧 OTP email would be sent to: ${email}`);
        console.log(`🔐 OTP Code: ${otpCode}`);
        return {
          success: true,
          messageId: "console-log",
          previewUrl: null,
        };
      }

      const result = await this.transporter.sendMail(mailOptions);

      // Get preview URL for development
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return {
        success: true,
        messageId: result.messageId,
        previewUrl,
      };
    } catch (error) {
      console.error("OTP email send error:", error);
      throw new Error("Failed to send OTP email");
    }
  }

  /**
   * Get HTML template for OTP email
   */
  getOTPEmailTemplate(name, otpCode) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your OTP Code - MTC Business</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 3px solid #1a1a2e; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0; }
          .otp-code { font-size: 36px; font-weight: bold; color: #1a1a2e; letter-spacing: 5px; font-family: monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .security-note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Your OTP Code 🔐</h1>
          <p>One-Time Password for Verification</p>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>You requested an OTP code for your MTC Business account. Use the code below to verify your identity:</p>
          
          <div class="otp-box">
            <p style="margin: 0 0 10px 0; color: #666;">Your OTP Code:</p>
            <div class="otp-code">${otpCode}</div>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong></p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> Never share this OTP code with anyone. MTC Business staff will never ask for your OTP code.
          </div>
          
          <div class="security-note">
            <strong>Security Note:</strong> If you didn't request this OTP, please ignore this email or contact our support team immediately.
          </div>
          
          <p>For security reasons:</p>
          <ul>
            <li>This OTP is valid for 10 minutes only</li>
            <li>Do not share this code with anyone</li>
            <li>Never reply to this email with your code</li>
          </ul>
        </div>
        <div class="footer">
          <p>© 2024 MTC Business. All rights reserved.</p>
          <p>This email was sent to ${email}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get text template for OTP email
   */
  getOTPEmailText(name, otpCode) {
    return `
Your OTP Code 🔐

Hello ${name},

You requested an OTP code for your MTC Business account. Use the code below to verify your identity:

=== YOUR OTP CODE ===
${otpCode}
====================

This code will expire in 10 minutes.

⚠️  IMPORTANT:
Never share this OTP code with anyone. MTC Business staff will never ask for your OTP code.

For security reasons:
- This OTP is valid for 10 minutes only
- Do not share this code with anyone
- Never reply to this email with your code

If you didn't request this OTP, please ignore this email or contact our support team immediately.

© 2024 MTC Business. All rights reserved.
    `;
  }

  /**
   * Send password reset OTP email
   * @param {string} email - Recipient email
   * @param {string} name - Recipient name
   * @param {string} otpCode - OTP code to send
   * @returns {Promise<Object>} - Email send result
   */
  async sendPasswordResetOTPEmail(email, name, otpCode) {
    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: "Password Reset OTP - MTC Business",
      html: this.getPasswordResetOTPEmailTemplate(name, email, otpCode),
      text: this.getPasswordResetOTPEmailText(name, otpCode),
    };

    try {
      if (!this.transporter) {
        // Fallback to console logging in development
        console.log(`📧 Password reset OTP email would be sent to: ${email}`);
        console.log(`🔐 Reset OTP Code: ${otpCode}`);
        return {
          success: true,
          messageId: "console-log",
          previewUrl: null,
        };
      }

      const result = await this.transporter.sendMail(mailOptions);

      // Get preview URL for development
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return {
        success: true,
        messageId: result.messageId,
        previewUrl,
      };
    } catch (error) {
      console.error("Password reset OTP email send error:", error);
      throw new Error("Failed to send password reset OTP email");
    }
  }

  /**
   * Get HTML template for password reset OTP email
   */
  getPasswordResetOTPEmailTemplate(name, email, otpCode) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset OTP - MTC Business</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #d32f2f, #c62828); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 3px solid #d32f2f; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0; }
          .otp-code { font-size: 36px; font-weight: bold; color: #d32f2f; letter-spacing: 5px; font-family: monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .security-note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #721c24; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset OTP 🔐</h1>
          <p>One-Time Password for Account Security</p>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>You requested to reset your password. Use the code below to verify your identity and set a new password:</p>
          
          <div class="otp-box">
            <p style="margin: 0 0 10px 0; color: #666;">Your Password Reset OTP Code:</p>
            <div class="otp-code">${otpCode}</div>
          </div>
          
          <p style="text-align: center; color: #666; font-size: 14px;">This code will expire in <strong>3 minutes</strong></p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> Never share this OTP code with anyone. MTC Business staff will never ask for your OTP code. Do not reply to this email with your code.
          </div>
          
          <div class="security-note">
            <strong>Security Note:</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged. Your account is secure.
          </div>
          
          <p>Steps to reset your password:</p>
          <ol>
            <li>Copy the OTP code above</li>
            <li>Go to the password reset page</li>
            <li>Enter your OTP code</li>
            <li>Set your new strong password</li>
            <li>Login with your new password</li>
          </ol>
        </div>
        <div class="footer">
          <p>© 2024 MTC Business. All rights reserved.</p>
          <p>This email was sent to ${email}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get text template for password reset OTP email
   */
  getPasswordResetOTPEmailText(name, otpCode) {
    return `
Password Reset OTP 🔐

Hello ${name},

You requested to reset your password. Use the code below to verify your identity and set a new password:

=== PASSWORD RESET OTP CODE ===
${otpCode}
================================

This code will expire in 3 minutes.

⚠️  IMPORTANT:
Never share this OTP code with anyone. MTC Business staff will never ask for your OTP code.

For security reasons:
- This OTP is valid for 3 minutes only
- Do not share this code with anyone
- Never reply to this email with your code

Steps to reset your password:
1. Copy the OTP code above
2. Go to the password reset page
3. Enter your OTP code
4. Set your new strong password
5. Login with your new password

If you didn't request a password reset, please ignore this email and your password will remain unchanged. Your account is secure.

© 2024 MTC Business. All rights reserved.
    `;
  }

  /**
   * Send portal credentials email to a newly created portal user
   */
  async sendPortalCredentialsEmail(email, name, tempPassword) {
    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}`;

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: "Your MTC Business Portal Credentials",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Portal Credentials - MTC Business</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .cred-box { background: white; border: 2px solid #1a1a2e; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .button { display: inline-block; background: #1a1a2e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #721c24; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Welcome to MTC Business Portal</h1>
            <p>Your login credentials are ready</p>
          </div>
          <div class="content">
            <h2>Hello ${name},</h2>
            <p>Your MTC Business Portal account has been created. Below are your login credentials:</p>
            <div class="cred-box">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>One-Time Password:</strong> <code style="background:#eee;padding:4px 8px;border-radius:4px;font-size:16px;">${tempPassword}</code></p>
            </div>
            <div style="text-align: center;">
              <a href="${loginUrl}" class="button">Login to Portal</a>
            </div>
            <div class="warning">
              <strong>Important:</strong> This is a one-time password. After you sign in, you will be required to set a new password before you can use the portal. Do not share these credentials with anyone.
            </div>
          </div>
          <div class="footer">
            <p>&copy; 2024 MTC Business. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\nYour MTC Business Portal account has been created.\n\nEmail: ${email}\nOne-Time Password: ${tempPassword}\n\nPlease login at: ${loginUrl}\nYou will be required to set a new password immediately after your first login.\n\n© 2024 MTC Business.`,
    };

    try {
      if (!this.transporter) {
        console.log(`📧 Portal credentials email would be sent to: ${email}`);
        console.log(`🔑 Temp password: ${tempPassword}`);
        return { success: true, messageId: "console-log", previewUrl: null };
      }

      const result = await this.transporter.sendMail(mailOptions);
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return { success: true, messageId: result.messageId, previewUrl };
    } catch (error) {
      console.error("Portal credentials email send error:", error);
      throw new Error("Failed to send portal credentials email");
    }
  }

  /**
   * Send assignment update email to an executive when reassigned.
   */
  async sendExecutiveReassignmentEmail(email, name, corporateName) {
    const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`;

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: `New Corporate Assignment - ${corporateName}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Corporate Reassignment - MTC Business</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; border: 1px solid #d1d5db; padding: 18px; border-radius: 8px; margin: 18px 0; }
            .button { display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
            .footer { text-align: center; margin-top: 24px; color: #666; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Corporate Assignment Updated</h1>
            <p>MTC Business CRM</p>
          </div>
          <div class="content">
            <h2>Hello ${name},</h2>
            <p>You have been assigned to a new corporate account by your manager.</p>
            <div class="info-box">
              <p><strong>Corporate:</strong> ${corporateName}</p>
              <p>Please review the account details and continue with follow-up actions.</p>
            </div>
            <a href="${dashboardUrl}" class="button">Open Dashboard</a>
          </div>
          <div class="footer">
            <p>&copy; 2024 MTC Business. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\nYou have been assigned to a new corporate account: ${corporateName}.\nPlease review the account details and continue with follow-up actions.\n\nOpen dashboard: ${dashboardUrl}\n\n© 2024 MTC Business.`,
    };

    try {
      if (!this.transporter) {
        console.log(`📧 Executive reassignment email would be sent to: ${email}`);
        console.log(`🏢 Corporate: ${corporateName}`);
        return { success: true, messageId: "console-log", previewUrl: null };
      }

      const result = await this.transporter.sendMail(mailOptions);
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return { success: true, messageId: result.messageId, previewUrl };
    } catch (error) {
      console.error("Executive reassignment email send error:", error);
      throw new Error("Failed to send executive reassignment email");
    }
  }

  /**
   * Send contract expiry alert email to manager/supervisor.
   */
  async sendContractExpiryAlertEmail(email, name, corporateName, accountName, contractType, contractEndDate, daysRemaining) {
    const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`;

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: `Contract Expiry Alert - ${corporateName}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Contract Expiry Alert - MTC Business</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .info-box { background: #fff; border: 1px solid #d1d5db; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 6px; margin-top: 12px; }
            .button { display: inline-block; background: #1a1a2e; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; margin-top: 16px; }
            .footer { text-align: center; margin-top: 24px; color: #666; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Contract Expiry Alert</h2>
            <p>MTC Business CRM</p>
          </div>
          <div class="content">
            <p>Hello ${name},</p>
            <p>A corporate contract in your portfolio is approaching expiry and requires attention.</p>
            <div class="info-box">
              <p><strong>Corporate:</strong> ${corporateName}</p>
              <p><strong>Account:</strong> ${accountName}</p>
              <p><strong>Contract Type:</strong> ${contractType}</p>
              <p><strong>Expiry Date:</strong> ${contractEndDate}</p>
              <p><strong>Time Remaining:</strong> ${daysRemaining} day(s)</p>
            </div>
            <a href="${dashboardUrl}" class="button">Open Dashboard</a>
          </div>
          <div class="footer">
            <p>&copy; 2024 MTC Business. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\nA corporate contract in your portfolio is approaching expiry.\n\nCorporate: ${corporateName}\nAccount: ${accountName}\nContract Type: ${contractType}\nExpiry Date: ${contractEndDate}\nTime Remaining: ${daysRemaining} day(s)\n\nOpen dashboard: ${dashboardUrl}\n\n© 2024 MTC Business.`,
    };

    try {
      if (!this.transporter) {
        console.log(`📧 Contract expiry alert email would be sent to: ${email}`);
        console.log(`🏢 Corporate: ${corporateName} | Account: ${accountName}`);
        return { success: true, messageId: "console-log", previewUrl: null };
      }

      const result = await this.transporter.sendMail(mailOptions);
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return { success: true, messageId: result.messageId, previewUrl };
    } catch (error) {
      console.error("Contract expiry email send error:", error);
      throw new Error("Failed to send contract expiry email");
    }
  }

  /**
   * Send ticket internal note alert email.
   */
  async sendTicketInternalNoteEmail(email, name, ticketNumber, noteAuthorName, noteAuthorRole, noteText) {
    const ticketUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/tickets`;
    const safeRole = String(noteAuthorRole || "").replace(/_/g, " ");

    const mailOptions = {
      from: {
        name: "MTC Business",
        address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
      },
      to: email,
      subject: `Internal Note Added - ${ticketNumber}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ticket Internal Note - MTC Business</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
            .note-box { background: #fff; border: 1px solid #d1d5db; border-left: 4px solid #1a1a2e; padding: 12px; border-radius: 6px; margin-top: 12px; }
            .button { display: inline-block; background: #1a1a2e; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; margin-top: 16px; }
            .footer { text-align: center; margin-top: 24px; color: #666; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Ticket Internal Note</h2>
            <p>${ticketNumber}</p>
          </div>
          <div class="content">
            <p>Hello ${name},</p>
            <p><strong>${noteAuthorName}</strong> (${safeRole}) added an internal note on ticket <strong>${ticketNumber}</strong>.</p>
            <div class="note-box">${String(noteText || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            <a href="${ticketUrl}" class="button">Open Tickets</a>
          </div>
          <div class="footer">
            <p>&copy; 2024 MTC Business. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\n${noteAuthorName} (${safeRole}) added an internal note on ${ticketNumber}.\n\nNote:\n${noteText}\n\nOpen tickets: ${ticketUrl}\n\n© 2024 MTC Business.`,
    };

    try {
      if (!this.transporter) {
        console.log(`📧 Ticket internal note email would be sent to: ${email}`);
        console.log(`🎫 Ticket: ${ticketNumber}`);
        return { success: true, messageId: "console-log", previewUrl: null };
      }

      const result = await this.transporter.sendMail(mailOptions);
      const previewUrl =
        process.env.NODE_ENV !== "production"
          ? nodemailer.getTestMessageUrl(result)
          : null;

      return { success: true, messageId: result.messageId, previewUrl };
    } catch (error) {
      console.error("Ticket internal note email send error:", error);
      throw new Error("Failed to send ticket internal note email");
    }
  }
}

/**
 * Send a visit/meeting invitation email to a teammate selected as an attendee
 * by the visit organizer. `visit` can be a Sequelize Visit instance or a plain
 * object with the same fields.
 */
EmailService.prototype.sendVisitInvitationEmail = async function (email, name, visit, organizerName) {
  const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`;

  const meetingTypeLabel = visit?.meetingType === "online" ? "Online Meeting" : "In-Person Visit";
  const locationOrLink =
    visit?.meetingType === "online"
      ? (visit?.onlineLink || "Link will be shared closer to the time")
      : (visit?.location || "To be confirmed");
  const safeAgenda = String(visit?.agenda || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const subject = `Meeting Invitation - ${visit?.accountName || "Customer Visit"} (${visit?.visitDate || ""})`;

  const mailOptions = {
    from: {
      name: "MTC Business",
      address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
    },
    to: email,
    subject,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Meeting Invitation - MTC Business</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
          .info-box { background: #fff; border: 1px solid #d1d5db; border-left: 4px solid #1a1a2e; padding: 14px; border-radius: 6px; margin-top: 12px; }
          .info-box p { margin: 4px 0; }
          .button { display: inline-block; background: #1a1a2e; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; margin-top: 16px; }
          .footer { text-align: center; margin-top: 24px; color: #666; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>You're Invited to a Customer Visit</h2>
          <p>${visit?.visitNumber || ""}</p>
        </div>
        <div class="content">
          <p>Hello ${name || "there"},</p>
          <p>${organizerName ? `<strong>${organizerName}</strong>` : "A teammate"} has scheduled a customer visit and added you as an attendee.</p>
          <div class="info-box">
            <p><strong>Customer:</strong> ${visit?.accountName || "—"}</p>
            <p><strong>Purpose:</strong> ${visit?.purpose || "—"}</p>
            <p><strong>Date:</strong> ${visit?.visitDate || "—"}</p>
            <p><strong>Time:</strong> ${visit?.startTime || "—"} – ${visit?.endTime || "—"}</p>
            <p><strong>Type:</strong> ${meetingTypeLabel}</p>
            <p><strong>${visit?.meetingType === "online" ? "Meeting Link" : "Location"}:</strong> ${locationOrLink}</p>
            ${safeAgenda ? `<p><strong>Agenda:</strong> ${safeAgenda}</p>` : ""}
          </div>
          <p style="margin-top:14px;">The visit is currently <strong>pending customer acceptance</strong>. You'll receive further updates as its status changes.</p>
          <a href="${dashboardUrl}" class="button">Open Dashboard</a>
        </div>
        <div class="footer">
          <p>&copy; 2024 MTC Business. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `Hello ${name || "there"},\n\n${organizerName || "A teammate"} has scheduled a customer visit and added you as an attendee.\n\nCustomer: ${visit?.accountName || "—"}\nPurpose: ${visit?.purpose || "—"}\nDate: ${visit?.visitDate || "—"}\nTime: ${visit?.startTime || "—"} - ${visit?.endTime || "—"}\nType: ${meetingTypeLabel}\n${visit?.meetingType === "online" ? "Meeting Link" : "Location"}: ${locationOrLink}\n${visit?.agenda ? `Agenda: ${visit.agenda}\n` : ""}\nThe visit is currently pending customer acceptance.\n\nOpen dashboard: ${dashboardUrl}\n\n© 2024 MTC Business.`,
  };

  try {
    if (!this.transporter) {
      console.log(`📧 Visit invitation email would be sent to: ${email}`);
      console.log(`📅 Visit: ${visit?.visitNumber || "(no number)"} - ${visit?.accountName || "(no account)"}`);
      return { success: true, messageId: "console-log", previewUrl: null };
    }

    const result = await this.transporter.sendMail(mailOptions);
    const previewUrl =
      process.env.NODE_ENV !== "production"
        ? nodemailer.getTestMessageUrl(result)
        : null;

    return { success: true, messageId: result.messageId, previewUrl };
  } catch (error) {
    console.error("Visit invitation email send error:", error);
    throw new Error("Failed to send visit invitation email");
  }
};

/**
 * Calendar invite (.ics) for approved/confirmed visits — works with Outlook / Teams.
 */
EmailService.prototype.sendVisitCalendarInviteEmail = async function (email, name, visit, icsContent, { cancel = false } = {}) {
  const subject = cancel
    ? `Cancelled: ${visit?.purpose || "Visit"} — ${visit?.accountName || ""} (${visit?.visitDate || ""})`
    : `Calendar invite: ${visit?.purpose || "Visit"} — ${visit?.accountName || ""} (${visit?.visitDate || ""})`;
  const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`;

  const mailOptions = {
    from: {
      name: "MTC Business",
      address: process.env.EMAIL_FROM || "noreply@mtcbusiness.com",
    },
    to: email,
    subject,
    html: `
      <p>Hello ${name || "there"},</p>
      <p>${
        cancel
          ? `The visit <strong>${visit?.visitNumber || ""}</strong> with ${visit?.accountName || "the customer"} has been <strong>cancelled</strong>.`
          : `Your meeting <strong>${visit?.visitNumber || ""}</strong> with ${visit?.accountName || "the customer"} is <strong>confirmed</strong>. Open the attached calendar invite to add it to Outlook or Microsoft Teams.`
      }</p>
      <p><strong>Date:</strong> ${visit?.visitDate || "—"} ${visit?.startTime || ""} – ${visit?.endTime || ""}</p>
      <p><a href="${dashboardUrl}">Open MTC Business portal</a></p>
    `,
    text: cancel
      ? `Visit ${visit?.visitNumber} cancelled.`
      : `Visit ${visit?.visitNumber} confirmed. Open the attached .ics file to add to your calendar.`,
    alternatives: [
      {
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        content: icsContent,
      },
    ],
    icalEvent: {
      filename: `visit-${visit?.visitNumber || "invite"}.ics`,
      method: cancel ? "CANCEL" : "REQUEST",
      content: icsContent,
    },
  };

  try {
    if (!this.transporter) {
      console.log(`📧 Calendar invite (.ics) would be sent to: ${email} (${visit?.visitNumber})`);
      return { success: true, messageId: "console-log" };
    }
    const result = await this.transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Visit calendar invite email error:", error);
    throw error;
  }
};

module.exports = new EmailService();
