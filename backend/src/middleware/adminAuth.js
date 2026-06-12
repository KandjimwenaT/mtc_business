const auth = require('./auth');

const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin role required.' });
      }
      next();
    });
  } catch (error) {
    console.error(error.message);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Standalone middleware (assumes auth middleware already ran and set req.user)
const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin role required.' });
  }
  next();
};

// Allow admin, manager, supervisor, or GM (read-only oversight) roles
const adminOrManager = (req, res, next) => {
  if (
    req.user.role !== 'admin' &&
    req.user.role !== 'manager' &&
    req.user.role !== 'supervisor' &&
    req.user.role !== 'gm'
  ) {
    return res.status(403).json({ message: 'Access denied. Admin, Manager, Supervisor, or GM role required.' });
  }
  next();
};

// GM has read-only access to admin APIs
const blockGmWrites = (req, res, next) => {
  if (req.user.role === 'gm' && req.method !== 'GET') {
    return res.status(403).json({ message: 'GM has read-only access.' });
  }
  next();
};

module.exports = { adminAuth, superAdminOnly, adminOrManager, blockGmWrites };
