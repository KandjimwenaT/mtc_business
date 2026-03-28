const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class SecurityService {
  constructor() {
    this.rateLimitStore = new Map();
    this.failedAttempts = new Map();
  }

  /**
   * Generate a cryptographically secure random string
   * @param {number} length - Length of the string
   * @returns {string} - Random string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a string using bcrypt
   * @param {string} data - Data to hash
   * @param {number} rounds - Bcrypt rounds (default: 12)
   * @returns {Promise<string>} - Hashed string
   */
  async hashData(data, rounds = 12) {
    const salt = await bcrypt.genSalt(rounds);
    return await bcrypt.hash(data, salt);
  }

  /**
   * Compare data with hash
   * @param {string} data - Data to compare
   * @param {string} hash - Hash to compare against
   * @returns {Promise<boolean>} - Whether data matches hash
   */
  async compareData(data, hash) {
    return await bcrypt.compare(data, hash);
  }

  /**
   * Generate a secure JWT token
   * @param {Object} payload - Token payload
   * @param {string} secret - JWT secret
   * @param {string} expiresIn - Token expiration
   * @returns {string} - JWT token
   */
  generateJWT(payload, secret, expiresIn = '1h') {
    return jwt.sign(payload, secret, { 
      expiresIn,
      issuer: 'mtc-business-api',
      audience: 'mtc-business-portal'
    });
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token
   * @param {string} secret - JWT secret
   * @returns {Object} - Decoded payload
   */
  verifyJWT(token, secret) {
    return jwt.verify(token, secret, {
      issuer: 'mtc-business-api',
      audience: 'mtc-business-portal'
    });
  }

  /**
   * Generate a secure session ID
   * @returns {string} - Session ID
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure API key
   * @param {number} length - Key length
   * @returns {string} - API key
   */
  generateApiKey(length = 32) {
    const prefix = 'vn_';
    const randomPart = crypto.randomBytes(length).toString('base64url');
    return `${prefix}${randomPart}`;
  }

  /**
   * Sanitize input to prevent XSS
   * @param {string} input - Input to sanitize
   * @returns {string} - Sanitized input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .trim()
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '') 
      .replace(/on\w+=/gi, '') 
      .substring(0, 1000); 
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} - Whether email is valid
   */
  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} - Validation result
   */
  validatePasswordStrength(password) {
    const result = {
      isValid: true,
      score: 0,
      feedback: []
    };

    if (password.length < 8) {
      result.isValid = false;
      result.feedback.push('Password must be at least 8 characters long');
    } else {
      result.score += 1;
    }

    if (password.length >= 12) {
      result.score += 1;
    }

    if (/[a-z]/.test(password)) {
      result.score += 1;
    } else {
      result.feedback.push('Password must contain at least one lowercase letter');
    }

    if (/[A-Z]/.test(password)) {
      result.score += 1;
    } else {
      result.feedback.push('Password must contain at least one uppercase letter');
    }

    if (/[0-9]/.test(password)) {
      result.score += 1;
    } else {
      result.feedback.push('Password must contain at least one number');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      result.score += 1;
    } else {
      result.feedback.push('Password should contain at least one special character');
    }

    if (result.score < 4) {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Check if IP is rate limited
   * @param {string} ip - IP address
   * @param {number} maxAttempts - Maximum attempts allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} - Whether IP is rate limited
   */
  isRateLimited(ip, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const key = `rate_limit_${ip}`;
    
    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, { count: 1, firstAttempt: now });
      return false;
    }

    const data = this.rateLimitStore.get(key);
    
    // Reset if window has passed
    if (now - data.firstAttempt > windowMs) {
      this.rateLimitStore.set(key, { count: 1, firstAttempt: now });
      return false;
    }

    // Check if limit exceeded
    if (data.count >= maxAttempts) {
      return true;
    }

    // Increment count
    data.count += 1;
    this.rateLimitStore.set(key, data);
    return false;
  }

  /**
   * Get current failed attempt status without incrementing
   * @param {string} identifier - Email or IP
   * @param {number} maxAttempts - Maximum attempts allowed
   * @returns {Object} - Current lock/attempt status
   */
  getFailedAttemptStatus(identifier, maxAttempts = 5) {
    const now = Date.now();
    const key = `failed_${identifier}`;

    if (!this.failedAttempts.has(key)) {
      return { isLocked: false, attemptsLeft: maxAttempts };
    }

    const data = this.failedAttempts.get(key);

    if (data.lockedUntil && now < data.lockedUntil) {
      return {
        isLocked: true,
        lockedUntil: data.lockedUntil,
        attemptsLeft: 0,
      };
    }

    if (data.lockedUntil && now >= data.lockedUntil) {
      this.failedAttempts.delete(key);
      return { isLocked: false, attemptsLeft: maxAttempts };
    }

    return {
      isLocked: false,
      attemptsLeft: Math.max(maxAttempts - data.count, 0),
    };
  }

  /**
   * Record failed login attempt
   * @param {string} identifier - Email or IP
   * @param {number} maxAttempts - Maximum attempts allowed
   * @param {number} lockoutMs - Lockout duration in milliseconds
   * @returns {Object} - Attempt result
   */
  recordFailedAttempt(identifier, maxAttempts = 5, lockoutMs = 15 * 60 * 1000) {
    const now = Date.now();
    const key = `failed_${identifier}`;
    
    if (!this.failedAttempts.has(key)) {
      this.failedAttempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null });
      return { isLocked: false, attemptsLeft: maxAttempts - 1 };
    }

    const data = this.failedAttempts.get(key);
    
    // Check if currently locked
    if (data.lockedUntil && now < data.lockedUntil) {
      return { 
        isLocked: true, 
        lockedUntil: data.lockedUntil,
        attemptsLeft: 0 
      };
    }

    // Reset if lockout period has passed
    if (data.lockedUntil && now >= data.lockedUntil) {
      this.failedAttempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null });
      return { isLocked: false, attemptsLeft: maxAttempts - 1 };
    }

    // Increment count
    data.count += 1;
    
    // Check if should be locked
    if (data.count >= maxAttempts) {
      data.lockedUntil = now + lockoutMs;
      this.failedAttempts.set(key, data);
      return { 
        isLocked: true, 
        lockedUntil: data.lockedUntil,
        attemptsLeft: 0 
      };
    }

    this.failedAttempts.set(key, data);
    return { 
      isLocked: false, 
      attemptsLeft: maxAttempts - data.count 
    };
  }

  /**
   * Clear failed attempts for identifier
   * @param {string} identifier - Email or IP
   */
  clearFailedAttempts(identifier) {
    const key = `failed_${identifier}`;
    this.failedAttempts.delete(key);
  }

  /**
   * Generate a secure CSRF token
   * @param {string} sessionId - Session ID
   * @returns {string} - CSRF token
   */
  generateCSRFToken(sessionId) {
    const secret = process.env.CSRF_SECRET || 'csrf-secret-key';
    return crypto
      .createHmac('sha256', secret)
      .update(sessionId)
      .digest('hex');
  }

  /**
   * Verify CSRF token
   * @param {string} token - CSRF token
   * @param {string} sessionId - Session ID
   * @returns {boolean} - Whether token is valid
   */
  verifyCSRFToken(token, sessionId) {
    const expectedToken = this.generateCSRFToken(sessionId);
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expectedToken, 'hex')
    );
  }

  /**
   * Generate a secure password reset code
   * @returns {string} - Reset code
   */
  generatePasswordResetCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes

    for (const [key, data] of this.rateLimitStore.entries()) {
      if (now - data.firstAttempt > windowMs) {
        this.rateLimitStore.delete(key);
      }
    }

    for (const [key, data] of this.failedAttempts.entries()) {
      if (data.lockedUntil && now >= data.lockedUntil) {
        this.failedAttempts.delete(key);
      }
    }
  }

  /**
   * Generate OTP (One-Time Password) for email/phone verification
   * @param {number} expiryMinutes - OTP expiration time in minutes (default: 10)
   * @returns {Object} - OTP code, hashed OTP, and expiration time
   */
  generateOTP(expiryMinutes = 10) {
    // Generate a 4-digit OTP code
    const OTPCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Hash the OTP using SHA256
    const hashedOTP = crypto
      .createHash('sha256')
      .update(OTPCode)
      .digest('hex');

    // Set expiration time
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    return {
      code: OTPCode,
      hashed: hashedOTP,
      expiresAt,
      expiresIn: `${expiryMinutes}m`,
    };
  }

  /**
   * Verify OTP
   * @param {string} providedOTP - OTP provided by user
   * @param {string} storedHashedOTP - Hashed OTP stored in database
   * @param {number} expiresAt - OTP expiration timestamp
   * @returns {boolean} - Whether OTP is valid
   */
  verifyOTP(providedOTP, storedHashedOTP, expiresAt) {
    // Check if OTP has expired
    if (Date.now() > expiresAt) {
      return false;
    }

    // Hash the provided OTP and compare
    const hashedProvidedOTP = crypto
      .createHash('sha256')
      .update(providedOTP)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hashedProvidedOTP, 'hex'),
      Buffer.from(storedHashedOTP, 'hex')
    );
  }

  /**
   * Get security headers for responses
   * @returns {Object} - Security headers
   */
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'",
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }
}

module.exports = new SecurityService();
