const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB, sequelize } = require('./src/config/database');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { xssProtection } = require('./src/middleware/security');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const auth = require('./src/middleware/auth');
const { superAdminOnly, adminOrManager } = require('./src/middleware/adminAuth');
const Person = require('./src/models/Person');
const GM = require('./src/models/GM');
const Manager = require('./src/models/Manager');
const ExecutiveStaff = require('./src/models/ExecutiveStaff');
const Corporate = require('./src/models/Corporate');
const AccountManager = require('./src/models/AccountManager');
const Account = require('./src/models/Account');
const Contract = require('./src/models/Contract');
const Service = require('./src/models/Service');
const Complaint = require('./src/models/Complaint');
const AccountRequest = require('./src/models/AccountRequest');
const Ticket = require('./src/models/Ticket');
const Visit = require('./src/models/Visit');
const OTPModel = require('./src/models/otpModel');
const complaintRoutes = require('./src/routes/complaintRoutes');
const accountRequestRoutes = require('./src/routes/accountRequestRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const visitRoutes = require('./src/routes/visitRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const Notification = require('./src/models/Notification');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure req.body is always an object (guards against missing Content-Type header)
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// XSS sanitization
app.use(xssProtection);

// Rate limiting
app.use('/api', apiLimiter);

// ── Public routes (no token needed) ──────────────────────────────
app.use('/api/auth', authRoutes);

// ── JWT guard: every /api/* route below this line requires a valid token ──
app.use('/api', auth);

// ── Protected routes (add new route files here) ───────────────────
app.use('/api/admin', adminOrManager, adminRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/account-requests', accountRequestRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'Failed', message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  // Body-parser / JSON parse errors
  if (err.status === 400 && err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'Failed', message: 'Invalid JSON in request body' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'Failed', message: 'Internal server error' });
});

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();
  // Ensure new corporate_id column exists on legacy accounts table.
  const queryInterface = sequelize.getQueryInterface();
  try {
    const accountTable = await queryInterface.describeTable('accounts');
    if (!accountTable.corporate_id) {
      await queryInterface.addColumn('accounts', 'corporate_id', {
        type: require('sequelize').DataTypes.INTEGER,
        allowNull: true,
      });
    }
  } catch (err) {
    // Fresh environments may not have the table yet; Account.sync will create it.
  }
  try {
    const personTable = await queryInterface.describeTable('persons');
    if (!personTable.corporate_id) {
      await queryInterface.addColumn('persons', 'corporate_id', {
        type: require('sequelize').DataTypes.INTEGER,
        allowNull: true,
      });
    }
  } catch (err) {
    // Fresh environments may not have the table yet; Person.sync will create it.
  }

  // Ensure corporates.approval_status ENUM includes waiting_approval (legacy dev DBs)
  try {
    const corporatesTable = await queryInterface.describeTable('corporates');
    const approvalCol = corporatesTable.approval_status;
    const columnTypeStr = typeof approvalCol?.type === "string" ? approvalCol.type : "";
    const alreadyHasWaiting = columnTypeStr.includes("waiting_approval");

    if (!alreadyHasWaiting) {
      await queryInterface.sequelize.query(`
        ALTER TABLE corporates
        MODIFY approval_status
        ENUM('pending','waiting_approval','approved','rejected')
        NOT NULL
        DEFAULT 'pending'
      `);
    }
  } catch (err) {
    // If the column doesn't exist yet or ALTER fails, Sequelize sync will handle fresh setups.
    // We intentionally swallow here to avoid breaking startup in partial environments.
  }
  // Ensure corporates.executive_id exists on legacy DBs
  try {
    const corporatesTable = await queryInterface.describeTable('corporates');
    if (!corporatesTable.executive_id) {
      await queryInterface.addColumn('corporates', 'executive_id', {
        type: require('sequelize').DataTypes.INTEGER,
        allowNull: true,
      });
    }
  } catch (err) {
    // Fresh environments may not have the table yet; Corporate.sync will create it.
  }
  // Ensure users.role ENUM includes supervisor (legacy dev DBs)
  try {
    const usersTable = await queryInterface.describeTable('users');
    const roleCol = usersTable.role;
    const roleTypeStr = typeof roleCol?.type === "string" ? roleCol.type : "";
    const hasSupervisorRole = roleTypeStr.includes("supervisor");
    if (!hasSupervisorRole) {
      await queryInterface.sequelize.query(`
        ALTER TABLE users
        MODIFY role
        ENUM('admin','executive_staff','supervisor','manager','gm','customer')
        NOT NULL
        DEFAULT 'executive_staff'
      `);
    }
  } catch (err) {
    // Swallow to preserve startup in partially initialized environments.
  }

  // Ensure persons.type ENUM includes supervisor (legacy dev DBs)
  try {
    const personsTable = await queryInterface.describeTable('persons');
    const typeCol = personsTable.type;
    const typeStr = typeof typeCol?.type === "string" ? typeCol.type : "";
    const hasSupervisorType = typeStr.includes("supervisor");
    if (!hasSupervisorType) {
      await queryInterface.sequelize.query(`
        ALTER TABLE persons
        MODIFY type
        ENUM('executive_staff','supervisor','manager','gm','admin','customer')
        NOT NULL
      `);
    }
  } catch (err) {
    // Swallow to preserve startup in partially initialized environments.
  }
  // Sync all models (tables already exist — use plain sync to avoid index accumulation)
  await Person.sync();
  await GM.sync();
  await Manager.sync();
  await ExecutiveStaff.sync();
  await Corporate.sync();
  await AccountManager.sync();
  await Account.sync();
  await Contract.sync();
  await Service.sync();
  await Complaint.sync();
  await AccountRequest.sync();
  await Ticket.sync();
  await Visit.sync();
  await Notification.sync();
  await OTPModel.sync();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();