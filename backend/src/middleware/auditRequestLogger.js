const { recordFromRequest, shouldSkipRequest } = require("../services/auditService");

function auditRequestLogger(req, res, next) {
  if (shouldSkipRequest(req)) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode || 200;
    if (status >= 200 && status < 300) {
      setImmediate(() => {
        recordFromRequest(req, body).catch((error) => {
          console.error("[audit] Request logger error:", error.message);
        });
      });
    }
    return originalJson(body);
  };

  next();
}

module.exports = auditRequestLogger;
