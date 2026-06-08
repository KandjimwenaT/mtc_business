/**
 * Adds Microsoft calendar + visit calendar sync columns.
 * Usage (from backend/): node scripts/syncMicrosoftCalendarSchemaMySQL.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { sequelize } = require("../src/config/database");

async function existingColumns(table) {
  const dbName = process.env.DB_NAME || "mtc_business";
  const [rows] = await sequelize.query(
    `
    SELECT COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table
    `,
    { replacements: { db: dbName, table } },
  );
  return new Set(rows.map((r) => String(r.columnName || r.COLUMN_NAME)));
}

async function addColumnIfMissing(table, columnName, ddl) {
  const cols = await existingColumns(table);
  if (cols.has(columnName)) {
    console.log(`(skip) ${table}.${columnName} already exists`);
    return;
  }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`✅ Added ${table}.${columnName}`);
}

async function main() {
  await sequelize.authenticate();

  await addColumnIfMissing("users", "ms_graph_refresh_token_enc", "ms_graph_refresh_token_enc TEXT NULL");
  await addColumnIfMissing("users", "ms_graph_access_token_enc", "ms_graph_access_token_enc TEXT NULL");
  await addColumnIfMissing("users", "ms_graph_token_expires_at", "ms_graph_token_expires_at DATETIME NULL");
  await addColumnIfMissing("users", "ms_graph_connected_at", "ms_graph_connected_at DATETIME NULL");

  await addColumnIfMissing("visits", "graph_event_id", "graph_event_id VARCHAR(255) NULL");
  await addColumnIfMissing("visits", "calendar_sequence", "calendar_sequence INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("visits", "calendar_last_synced_at", "calendar_last_synced_at DATETIME NULL");

  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
