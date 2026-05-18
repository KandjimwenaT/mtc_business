#!/usr/bin/env node
/* eslint-disable no-console */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/config/database");
const { runKeyAccountsImport } = require("../src/services/keyAccountsExcelImportService");

function parseArgs(argv) {
  const args = {
    file: "",
    sheet: "",
    dryRun: false,
    createMissingExecutives: false,
    includeAccounts: false,
    includeServices: false,
    includeContracts: false,
    limit: 0,
    offset: 0,
    managerId: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      args.file = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--sheet") {
      args.sheet = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
    }
    if (arg === "--create-missing-executives") {
      args.createMissingExecutives = true;
    }
    if (arg === "--include-accounts") {
      args.includeAccounts = true;
    }
    if (arg === "--include-services") {
      args.includeServices = true;
    }
    if (arg === "--include-contracts") {
      args.includeContracts = true;
    }
    if (arg === "--limit") {
      args.limit = Number(argv[i + 1] || 0);
      i += 1;
    }
    if (arg === "--offset") {
      args.offset = Number(argv[i + 1] || 0);
      i += 1;
    }
    if (arg === "--manager-id") {
      args.managerId = Number(argv[i + 1] || 0);
      i += 1;
    }
  }

  return args;
}

function requireArg(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  requireArg(args.file, "Missing --file. Example: --file \"/path/file.xlsx\"");

  const excelPath = path.resolve(args.file);
  console.log(`Reading Excel: ${excelPath}`);
  const workbookBuffer = fs.readFileSync(excelPath);

  const result = await runKeyAccountsImport({
    workbookBuffer,
    sheet: args.sheet,
    dryRun: args.dryRun,
    createMissingExecutives: args.createMissingExecutives,
    includeAccounts: args.includeAccounts,
    includeServices: args.includeServices,
    includeContracts: args.includeContracts,
    limit: args.limit,
    offset: args.offset,
    ...(args.managerId > 0 ? { assignedManagerProfileId: args.managerId } : {}),
    onProgress: (msg) => console.log(msg),
  });

  const { sheetName, stats, unresolved, createdExecutives, offset, limit } = result;

  console.log("\nImport completed.");
  console.log(`Sheet: ${sheetName}`);
  console.log(`Offset: ${offset}`);
  console.log(`Limit: ${limit || "all"}`);
  console.log(`Total rows: ${stats.totalRows}`);
  console.log(`Created: ${stats.created}`);
  console.log(`Updated: ${stats.updated}`);
  if (args.includeAccounts) {
    console.log(`Accounts created: ${stats.accountsCreated}`);
    console.log(`Accounts updated: ${stats.accountsUpdated}`);
  }
  if (args.includeServices) {
    console.log(`Services created: ${stats.servicesCreated}`);
    console.log(`Services updated: ${stats.servicesUpdated}`);
  }
  if (args.includeContracts) {
    console.log(`Contracts created: ${stats.contractsCreated}`);
    console.log(`Contracts updated: ${stats.contractsUpdated}`);
  }
  console.log(`Corporate-name dedupe hits: ${stats.corporateNameDedupHits}`);
  console.log(`Account-name dedupe hits: ${stats.accountNameDedupHits}`);
  console.log(`Skipped service rows (missing MSISDN): ${stats.skippedServiceRows}`);
  console.log(`Skipped (missing required fields): ${stats.skipped}`);
  console.log(`Unresolved account managers: ${stats.unresolvedExecutive}`);
  if (createdExecutives.length > 0) {
    console.log(`Created executive staff records: ${createdExecutives.length}`);
  }

  if (unresolved.length > 0) {
    console.log("\nFirst unresolved mappings:");
    unresolved.slice(0, 20).forEach((row) => {
      console.log(
        `- ${row.corporateNumber} | ${row.corporateName} | Account Manager: ${row.accountManager}`
      );
    });
  }

  await sequelize.close();
}

main().catch(async (error) => {
  console.error("Import failed:", error.message);
  if (error.name) console.error("Error name:", error.name);
  if (error.rowContext) console.error("Row context:", error.rowContext);
  if (error.errors && Array.isArray(error.errors)) {
    console.error(
      "Validation details:",
      error.errors.map((e) => ({
        message: e.message,
        path: e.path,
        value: e.value,
        type: e.type,
      }))
    );
  }
  if (error.parent?.sqlMessage) console.error("SQL message:", error.parent.sqlMessage);
  if (error.parent?.sql) console.error("SQL:", error.parent.sql);
  if (error.stack) console.error(error.stack);
  try {
    await sequelize.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
