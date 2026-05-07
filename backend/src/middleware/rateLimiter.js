const rateLimit = require('express-rate-limit');
const isProduction = process.env.NODE_ENV === "production";

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API rate limiter
const apiLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  isProduction ? 100 : 1000, // relaxed in development to avoid local throttling
  'Too many requests from this IP, please try again later.'
);

// Auth rate limiter (stricter)
const authLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  isProduction ? 5 : 50, // relaxed in development while staying stricter than general API
  'Too many authentication attempts, please try again later.'
);

module.exports = {
  apiLimiter,
  authLimiter
};
