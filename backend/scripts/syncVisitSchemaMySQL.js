/**
 * Run once against MySQL so the visits table matches Visit.js:
 * - status ENUM includes follow_up_pending
 * - meeting start GPS columns exist (nullable)
 *
 * Usage (from backend/): node scripts/syncVisitSchemaMySQL.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { sequelize } = require("../src/config/database");

const VISIT_STATUSES_FOR_ENUM = [
  "pending",
  "approved",
  "declined",
  "confirmed",
  "follow_up_pending",
  "completed",
  "cancelled",
  "rescheduled",
];

async function existingVisitColumns() {
  const dbName = process.env.DB_NAME || "mtc_business";
  const [rows] = await sequelize.query(
    `
    SELECT COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'visits'
    `,
    { replacements: { db: dbName } }
  );
  return new Set(rows.map((r) => String(r.columnName || r.COLUMN_NAME)));
}

async function main() {
  await sequelize.authenticate();
  const enumLiteral = VISIT_STATUSES_FOR_ENUM.map((s) => `'${s}'`).join(",");

  await sequelize.query(`
    ALTER TABLE visits
    MODIFY COLUMN status ENUM(${enumLiteral}) NOT NULL DEFAULT 'pending'
  `);
  console.log("✅ visits.status ENUM now includes follow_up_pending");

  const cols = await existingVisitColumns();

  if (!cols.has("meeting_started_at")) {
    await sequelize.query(`
      ALTER TABLE visits ADD COLUMN meeting_started_at DATETIME NULL COMMENT 'Executive opened Start visit (GPS capture)'
    `);
    console.log("✅ Added visits.meeting_started_at");
  } else {
    console.log("(skip) meeting_started_at already exists");
  }

  if (!cols.has("start_geo_latitude")) {
    await sequelize.query(`
      ALTER TABLE visits ADD COLUMN start_geo_latitude DOUBLE NULL
    `);
    console.log("✅ Added visits.start_geo_latitude");
  } else {
    console.log("(skip) start_geo_latitude already exists");
  }

  if (!cols.has("start_geo_longitude")) {
    await sequelize.query(`
      ALTER TABLE visits ADD COLUMN start_geo_longitude DOUBLE NULL
    `);
    console.log("✅ Added visits.start_geo_longitude");
  } else {
    console.log("(skip) start_geo_longitude already exists");
  }

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
