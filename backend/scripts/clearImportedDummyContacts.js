#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Clears the legacy dummy contact details that the bulk Excel importer used to
 * stamp on every Account row ("Imported Contact" + *.contact@placeholder.local
 * emails). After this script runs, those Account rows have empty contact
 * fields, which the UI treats as "Profile Incomplete" and renders the contact
 * person as "Not assigned".
 *
 * Usage:
 *   node backend/scripts/clearImportedDummyContacts.js              # dry run
 *   node backend/scripts/clearImportedDummyContacts.js --apply      # commit
 */
require("dotenv").config();

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/database");
const Account = require("../src/models/Account");

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  await sequelize.authenticate();

  // Match either the legacy "Imported Contact" name combo or any contact email
  // that points at the @placeholder.local domain the importer used to mint.
  const where = {
    [Op.or]: [
      { contactFirstName: "Imported", contactLastName: "Contact" },
      { contactEmail: { [Op.like]: "%@placeholder.local" } },
    ],
  };

  const total = await Account.count({ where });
  console.log(`Accounts with dummy import contact details: ${total}`);

  if (total === 0) {
    console.log("Nothing to clean up.");
    await sequelize.close();
    return;
  }

  const sample = await Account.findAll({
    where,
    attributes: [
      "accountId",
      "accountNumber",
      "accountName",
      "contactFirstName",
      "contactLastName",
      "contactEmail",
    ],
    limit: 10,
  });
  console.log("\nSample (up to 10):");
  sample.forEach((a) => {
    console.log(
      `- #${a.accountId} ${a.accountNumber} | ${a.accountName} | ${a.contactFirstName} ${a.contactLastName} | ${a.contactEmail}`
    );
  });

  if (!args.apply) {
    console.log("\nDry run only. Re-run with --apply to clear these contact fields.");
    await sequelize.close();
    return;
  }

  // Empty strings (not NULL) so the model's allowNull:false constraint stays
  // satisfied. The frontend treats blanks the same as missing.
  const [affected] = await Account.update(
    { contactFirstName: "", contactLastName: "", contactEmail: "" },
    { where }
  );

  console.log(`\nCleared dummy contact details on ${affected} account(s).`);
  await sequelize.close();
}

main().catch(async (error) => {
  console.error("clearImportedDummyContacts failed:", error.message);
  if (error.parent?.sqlMessage) console.error("SQL message:", error.parent.sqlMessage);
  if (error.stack) console.error(error.stack);
  try {
    await sequelize.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
