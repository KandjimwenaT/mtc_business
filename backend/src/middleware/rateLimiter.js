const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';
const isStrictEnv = isProduction; // uat/staging/development use relaxed limits

const parseLimit = (envValue, fallback) => {
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createRateLimiter = (windowMs, max, message, options = {}) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
};

// General API rate limiter
const apiLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  parseLimit(process.env.RATE_LIMIT_API_MAX, isStrictEnv ? 100 : 1000),
  'Too many requests from this IP, please try again later.'
);

// Auth rate limiter (stricter). Only failed auth responses count toward the cap.
const authLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  parseLimit(process.env.RATE_LIMIT_AUTH_MAX, isStrictEnv ? 20 : 50),
  'Too many authentication attempts, please try again later.',
  { skipSuccessfulRequests: true }
);

module.exports = {
  apiLimiter,
  authLimiter
};
