const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
const securityService = require('../services/securityService');

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  const headers = securityService.getSecurityHeaders();
  
  Object.keys(headers).forEach(key => {
    res.setHeader(key, headers[key]);
  });
  
  next();
};

/**
 * XSS protection middleware
 */
const xssProtection = (req, res, next) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? xss(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }
  
  return sanitized;
};

/**
 * Input validation middleware
 */
const validateInput = (req, res, next) => {
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /expression\s*\(/i,
    /vbscript:/i,
  ];
  
  const checkForSuspiciousContent = (obj, path = '') => {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];
        
        if (typeof value === 'string') {
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(value)) {
              return res.status(400).json({
                success: false,
                message: 'Suspicious content detected',
                field: currentPath
              });
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          const result = checkForSuspiciousContent(value, currentPath);
          if (result) return result;
        }
      }
    }
    return null;
  };

  const bodyObj = req.body && typeof req.body === 'object' ? req.body : {};
  const queryObj = req.query && typeof req.query === 'object' ? req.query : {};
  const paramsObj = req.params && typeof req.params === 'object' ? req.params : {};

  const suspiciousContent = checkForSuspiciousContent(bodyObj) ||
                            checkForSuspiciousContent(queryObj) ||
                            checkForSuspiciousContent(paramsObj);
  
  if (suspiciousContent) {
    return suspiciousContent;
  }
  
  next();
};

/**
 * Rate limiting for different endpoints
 */
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Specific rate limiters
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts, please try again later.'
);

const emailRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  3, // 3 attempts
  'Too many email requests, please try again later.'
);

const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many requests, please try again later.'
);

const strictRateLimit = createRateLimit(
  5 * 60 * 1000, // 5 minutes
  10, // 10 requests
  'Too many requests, please slow down.'
);

/**
 * IP whitelist middleware
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied from this IP address'
      });
    }
    
    next();
  };
};

/**
 * Request size limiter
 */
const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxBytes = parseSize(maxSize);
    
    if (contentLength > maxBytes) {
      return res.status(413).json({
        success: false,
        message: 'Request entity too large'
      });
    }
    
    next();
  };
};

/**
 * Parse size string to bytes
 */
const parseSize = (size) => {
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  return Math.floor(value * units[unit]);
};

/**
 * CSRF protection middleware
 */
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and certain endpoints
  if (req.method === 'GET' || 
      req.path.startsWith('/api/auth/verify-email') ||
      req.path.startsWith('/api/auth/reset-password')) {
    return next();
  }
  
  const csrfToken = req.get('X-CSRF-Token');
  const sessionId = req.sessionID || req.get('X-Session-ID');
  
  if (!csrfToken || !sessionId) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token or session ID missing'
    });
  }
  
  if (!securityService.verifyCSRFToken(csrfToken, sessionId)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token'
    });
  }
  
  next();
};

/**
 * Account lockout protection
 */
const accountLockoutProtection = (req, res, next) => {
  const email = req.body.email;
  
  if (!email) {
    return next();
  }
  
  const failedAttempts = securityService.recordFailedAttempt(email, 5, 15 * 60 * 1000);
  
  if (failedAttempts.isLocked) {
    return res.status(429).json({
      success: false,
      message: 'Account temporarily locked due to too many failed attempts',
      lockedUntil: failedAttempts.lockedUntil,
      retryAfter: Math.ceil((failedAttempts.lockedUntil - Date.now()) / 1000)
    });
  }
  
  next();
};

/**
 * Cleanup expired entries periodically
 */
const startCleanupInterval = () => {
  setInterval(() => {
    securityService.cleanupExpiredEntries();
  }, 5 * 60 * 1000); // Every 5 minutes
};

module.exports = {
  securityHeaders,
  xssProtection,
  validateInput,
  createRateLimit,
  authRateLimit,
  emailRateLimit,
  generalRateLimit,
  strictRateLimit,
  ipWhitelist,
  requestSizeLimit,
  csrfProtection,
  accountLockoutProtection,
  startCleanupInterval
};
