#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Removes placeholder executives created by the key-accounts Excel import
 * (email ends with @import.local) that still have no portal user (userId is null).
 *
 * The admin UI lists these under "pending imported executives" (API: executives
 * with userId null). This script only deletes the import placeholders, not every
 * userId-null row.
 *
 * Clears FK references (corporate/account/ticket/etc.), deletes any visits and
 * control cards still tied to those executives, then deletes the ExecutiveStaff rows.
 *
 * Usage:
 *   cd backend && node scripts/deletePendingImportedExecutives.js           # dry run
 *   cd backend && node scripts/deletePendingImportedExecutives.js --apply   # execute
 */
require("dotenv").config();

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/database");

const ExecutiveStaff = require("../src/models/ExecutiveStaff");
const Corporate = require("../src/models/Corporate");
const Account = require("../src/models/Account");
const Ticket = require("../src/models/Ticket");
const Complaint = require("../src/models/Complaint");
const AccountRequest = require("../src/models/AccountRequest");
const Visit = require("../src/models/Visit");
const ControlCard = require("../src/models/ControlCard");

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--apply") args.apply = true;
  }
  return args;
}

function importExecutiveWhere() {
  return {
    [Op.and]: [{ email: { [Op.like]: "%@import.local" } }, { userId: null }],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const where = importExecutiveWhere();

  await sequelize.authenticate();

  const placeholders = await ExecutiveStaff.findAll({
    where,
    attributes: ["executiveId", "firstName", "lastName", "email"],
    order: [["executiveId", "ASC"]],
  });
  const executiveIds = placeholders.map((e) => e.executiveId);

  if (executiveIds.length === 0) {
    console.log("No pending import placeholder executives (*@import.local, userId null). Nothing to do.");
    await sequelize.close();
    return;
  }

  console.log(`Found ${executiveIds.length} placeholder executive row(s):\n`);
  placeholders.slice(0, 20).forEach((e) => {
    console.log(`  id ${e.executiveId}: ${e.firstName} ${e.lastName} <${e.email}>`);
  });
  if (placeholders.length > 20) console.log(`  … and ${placeholders.length - 20} more`);

  if (!args.apply) {
    console.log("\nDry-run only. Re-run with --apply to delete these rows and clear FKs.");
    await sequelize.close();
    return;
  }

  const tx = await sequelize.transaction();
  try {
    await Ticket.update({ executiveId: null }, { where: { executiveId: { [Op.in]: executiveIds } }, transaction: tx });
    await Complaint.update({ executiveId: null }, { where: { executiveId: { [Op.in]: executiveIds } }, transaction: tx });
    await AccountRequest.update(
      { executiveId: null },
      { where: { executiveId: { [Op.in]: executiveIds } }, transaction: tx }
    );
    await Corporate.update({ executiveId: null }, { where: { executiveId: { [Op.in]: executiveIds } }, transaction: tx });
    await Account.update({ executiveId: null }, { where: { executiveId: { [Op.in]: executiveIds } }, transaction: tx });

    const visits = await Visit.findAll({
      where: { executiveId: { [Op.in]: executiveIds } },
      attributes: ["visitId"],
      transaction: tx,
    });
    const visitIds = visits.map((v) => v.visitId);
    if (visitIds.length) {
      await ControlCard.destroy({ where: { visitId: { [Op.in]: visitIds } }, transaction: tx });
      await Visit.destroy({ where: { visitId: { [Op.in]: visitIds } }, transaction: tx });
    }

    const deleted = await ExecutiveStaff.destroy({
      where: { executiveId: { [Op.in]: executiveIds } },
      transaction: tx,
    });

    await tx.commit();
    await sequelize.close();
    console.log(`\nDeleted ${deleted} ExecutiveStaff row(s).`);
  } catch (error) {
    await tx.rollback();
    await sequelize.close();
    console.error("Delete failed:", error.message);
    if (error.parent?.sqlMessage) console.error("SQL message:", error.parent.sqlMessage);
    process.exit(1);
  }
}

main();
