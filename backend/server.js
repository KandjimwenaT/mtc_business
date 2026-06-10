const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
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
const CorporateContactPerson = require('./src/models/CorporateContactPerson');
const Account = require('./src/models/Account');
const Contract = require('./src/models/Contract');
const Service = require('./src/models/Service');
const Invoice = require('./src/models/Invoice');
const Complaint = require('./src/models/Complaint');
const AccountRequest = require('./src/models/AccountRequest');
const Ticket = require('./src/models/Ticket');
const TicketInternalNote = require('./src/models/TicketInternalNote');
const TicketActivityLog = require('./src/models/TicketActivityLog');
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
const PORT = 3003;

// nginx (or similar) forwards X-Forwarded-For; required for req.ip and express-rate-limit.
app.set('trust proxy', 1);

// Security middleware — cross-origin images from /uploads (e.g. Vite on :5173, API on :3003)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
const normalizeOrigin = (value) =>
  typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGINS,
  'http://localhost:5173',
  'http://41.219.71.112:8081',
]
  .filter(Boolean)
  .flatMap((entry) => entry.split(','))
  .map(normalizeOrigin)
  .filter(Boolean);

const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

app.use(cors({
  origin(origin, callback) {
    // Same-origin or non-browser clients (curl, Postman) — no Origin header.
    if (!origin) return callback(null, true);
    if (uniqueAllowedOrigins.includes(normalizeOrigin(origin))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

const uploadsRoot = path.join(__dirname, 'uploads');
const broadcastUploadsDir = path.join(uploadsRoot, 'broadcasts');
const ticketUploadsDir = path.join(uploadsRoot, 'tickets');
if (!fs.existsSync(broadcastUploadsDir)) {
  fs.mkdirSync(broadcastUploadsDir, { recursive: true });
}
if (!fs.existsSync(ticketUploadsDir)) {
  fs.mkdirSync(ticketUploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsRoot));

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
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: 'Failed',
      message:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded file exceeds the maximum allowed size.'
          : err.message,
    });
  }
  if (
    err &&
    typeof err.message === 'string' &&
    err.message.includes('Only Excel')
  ) {
    return res.status(400).json({ status: 'Failed', message: err.message });
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
  // Ensure tickets table has creator/source/attachment columns on legacy DBs
  try {
    const ticketTable = await queryInterface.describeTable('tickets');
    const dt = require('sequelize').DataTypes;
    if (!ticketTable.created_by_user_id) {
      await queryInterface.addColumn('tickets', 'created_by_user_id', { type: dt.INTEGER, allowNull: true });
    }
    if (!ticketTable.created_by_role) {
      await queryInterface.addColumn('tickets', 'created_by_role', { type: dt.STRING, allowNull: true });
    }
    if (!ticketTable.created_by_name) {
      await queryInterface.addColumn('tickets', 'created_by_name', { type: dt.STRING, allowNull: true });
    }
    if (!ticketTable.created_for_account_id) {
      await queryInterface.addColumn('tickets', 'created_for_account_id', { type: dt.INTEGER, allowNull: true });
    }
    if (!ticketTable.created_for_customer_user_id) {
      await queryInterface.addColumn('tickets', 'created_for_customer_user_id', { type: dt.INTEGER, allowNull: true });
    }
    if (!ticketTable.source_context_note) {
      await queryInterface.addColumn('tickets', 'source_context_note', { type: dt.TEXT, allowNull: true });
    }
    if (!ticketTable.attachment_url) {
      await queryInterface.addColumn('tickets', 'attachment_url', { type: dt.STRING, allowNull: true });
    }
    if (!ticketTable.source_channel) {
      await queryInterface.addColumn('tickets', 'source_channel', {
        type: dt.ENUM('portal', 'email', 'phone'),
        allowNull: false,
        defaultValue: 'portal',
      });
    }
  } catch (err) {
    // Fresh environments may not have tickets table yet; Ticket.sync will create it.
  }
  // Ensure services.current_service_owner exists on legacy DBs
  try {
    const servicesTable = await queryInterface.describeTable('services');
    const dt = require('sequelize').DataTypes;
    if (!servicesTable.current_service_owner) {
      await queryInterface.addColumn('services', 'current_service_owner', {
        type: dt.STRING,
        allowNull: true,
      });
    }
    // Legacy DBs may still have a unique constraint on msisdn; imports can contain duplicate service lines.
    try {
      await queryInterface.removeIndex('services', 'unique_msisdn');
    } catch (_) {
      // Index may not exist; ignore.
    }
  } catch (err) {
    // Fresh environments may not have services table yet; Service.sync will create it.
  }
  // Sync all models (tables already exist — use plain sync to avoid index accumulation)
  await Person.sync();
  await GM.sync();
  await Manager.sync();
  await ExecutiveStaff.sync();
  await Corporate.sync();
  await AccountManager.sync();
  await CorporateContactPerson.sync();
  await Account.sync();
  await Contract.sync();
  await Service.sync();
  await Invoice.sync();
  await Complaint.sync();
  await AccountRequest.sync();
  await Ticket.sync();
  await TicketInternalNote.sync();
  await TicketActivityLog.sync();
  await Visit.sync();
  await Notification.sync();
  await OTPModel.sync();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();