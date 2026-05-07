#!/usr/bin/env node
/* eslint-disable no-console */
require("dotenv").config();

const path = require("path");
const XLSX = require("xlsx");
const { Op } = require("sequelize");
const { sequelize } = require("../src/config/database");

const Corporate = require("../src/models/Corporate");
const Account = require("../src/models/Account");
const Service = require("../src/models/Service");
const Contract = require("../src/models/Contract");
const Invoice = require("../src/models/Invoice");
const Visit = require("../src/models/Visit");
const ControlCard = require("../src/models/ControlCard");
const Ticket = require("../src/models/Ticket");
const TicketInternalNote = require("../src/models/TicketInternalNote");
const AccountRequest = require("../src/models/AccountRequest");
const Complaint = require("../src/models/Complaint");
const AccountManager = require("../src/models/AccountManager");
const Person = require("../src/models/Person");
const ExecutiveStaff = require("../src/models/ExecutiveStaff");

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const args = {
    file: "",
    sheet: "",
    apply: false,
    limit: 0,
    offset: 0,
    deleteImportExecutives: true,
    deleteMasterRecords: false,
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
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--limit") {
      args.limit = Number(argv[i + 1] || 0);
      i += 1;
      continue;
    }
    if (arg === "--offset") {
      args.offset = Number(argv[i + 1] || 0);
      i += 1;
      continue;
    }
    if (arg === "--no-delete-import-executives") {
      args.deleteImportExecutives = false;
      continue;
    }
    if (arg === "--delete-master-records") {
      args.deleteMasterRecords = true;
    }
  }
  return args;
}

function requireArg(condition, message) {
  if (!condition) throw new Error(message);
}

function detectHeaderRow(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  for (let i = 0; i < Math.min(matrix.length, 30); i += 1) {
    const row = matrix[i].map((cell) => normalizeHeader(cell));
    if (row.some((x) => x.includes("accountnumber")) && row.some((x) => x.includes("accountmanager"))) {
      return i;
    }
  }
  return 0;
}

function pickColumn(headers, candidates) {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));
  for (const candidate of candidates) {
    const found = normalized.find((h) => h.normalized === normalizeHeader(candidate));
    if (found) return found.original;
  }
  return null;
}

async function countByWhere(Model, where, transaction) {
  return Model.count({ where, transaction });
}

async function destroyByWhere(Model, where, transaction) {
  return Model.destroy({ where, transaction });
}

async function main() {
  const args = parseArgs(process.argv);
  requireArg(args.file, "Missing --file. Example: --file \"/path/file.xlsx\"");

  const excelPath = path.resolve(args.file);
  const workbook = XLSX.readFile(excelPath);
  const sheetName = args.sheet || workbook.SheetNames[0];
  requireArg(!!workbook.Sheets[sheetName], `Sheet not found: ${sheetName}`);

  const headerRow = detectHeaderRow(workbook.Sheets[sheetName]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    range: headerRow,
  });
  requireArg(rows.length > 0, "No rows found in the selected sheet.");

  const pickedRows = rows.slice(args.offset, args.limit > 0 ? args.offset + args.limit : undefined);
  const headers = Object.keys(rows[0]);
  const accountNumberCol = pickColumn(headers, [
    "ACCOUNT_NUMBER",
    "Account Number",
    "Active Business Number",
    "Corporate Number",
  ]);
  const msisdnCol = pickColumn(headers, ["MSISDN", "Phone Number", "Service Number"]);
  const srNumberCol = pickColumn(headers, ["Sr Number", "SR Number", "srNumber"]);
  requireArg(accountNumberCol, "Could not find account/corporate number column in Excel.");

  const corporateNumbers = [...new Set(pickedRows.map((r) => normalizeText(r[accountNumberCol])).filter(Boolean))];
  const msisdns = msisdnCol
    ? [...new Set(pickedRows.map((r) => normalizeText(r[msisdnCol])).filter(Boolean))]
    : [];
  const srNumbers = srNumberCol
    ? [...new Set(pickedRows.map((r) => normalizeText(r[srNumberCol])).filter(Boolean))]
    : [];
  requireArg(corporateNumbers.length > 0, "No account/corporate numbers found in selected rows.");

  await sequelize.authenticate();

  const tx = await sequelize.transaction();
  try {
    const corporates = await Corporate.findAll({
      where: { corporateNumber: { [Op.in]: corporateNumbers } },
      attributes: ["corporateId", "corporateNumber"],
      transaction: tx,
    });
    const corporateIds = corporates.map((c) => c.corporateId);

    const accounts = await Account.findAll({
      where: {
        [Op.or]: [
          { accountNumber: { [Op.in]: corporateNumbers } },
          corporateIds.length ? { corporateId: { [Op.in]: corporateIds } } : null,
        ].filter(Boolean),
      },
      attributes: ["accountId", "accountNumber", "corporateId"],
      transaction: tx,
    });
    const accountIds = accounts.map((a) => a.accountId);

    const tickets = accountIds.length
      ? await Ticket.findAll({
          where: { accountId: { [Op.in]: accountIds } },
          attributes: ["ticketId"],
          transaction: tx,
        })
      : [];
    const ticketIds = tickets.map((t) => t.ticketId);

    const targetedServices = accountIds.length
      ? await Service.findAll({
          where: msisdns.length
            ? { accountId: { [Op.in]: accountIds }, msisdn: { [Op.in]: msisdns } }
            : { accountId: -1 },
          attributes: ["serviceId"],
          transaction: tx,
        })
      : [];
    const targetedServiceIds = targetedServices.map((s) => s.serviceId);

    const contractWhere = {
      [Op.or]: [
        srNumbers.length ? { srNumber: { [Op.in]: srNumbers } } : null,
        targetedServiceIds.length ? { serviceId: { [Op.in]: targetedServiceIds } } : null,
      ].filter(Boolean),
    };

    const targetedContracts = contractWhere[Op.or].length
      ? await Contract.findAll({
          where: {
            accountId: { [Op.in]: accountIds },
            ...contractWhere,
          },
          attributes: ["contractId"],
          transaction: tx,
        })
      : [];
    const targetedContractIds = targetedContracts.map((c) => c.contractId);

    const counts = {
      corporates: corporates.length,
      accounts: accounts.length,
      targetedServices: targetedServiceIds.length,
      targetedContracts: targetedContractIds.length,
      invoices: args.deleteMasterRecords && accountIds.length
        ? await countByWhere(Invoice, { accountId: { [Op.in]: accountIds } }, tx)
        : 0,
      visits: args.deleteMasterRecords && accountIds.length
        ? await countByWhere(Visit, { accountId: { [Op.in]: accountIds } }, tx)
        : 0,
      controlCards: args.deleteMasterRecords && accountIds.length
        ? await countByWhere(ControlCard, { accountId: { [Op.in]: accountIds } }, tx)
        : 0,
      tickets: args.deleteMasterRecords && ticketIds.length ? ticketIds.length : 0,
      ticketInternalNotes: args.deleteMasterRecords && ticketIds.length
        ? await countByWhere(TicketInternalNote, { ticketId: { [Op.in]: ticketIds } }, tx)
        : 0,
      accountRequests: args.deleteMasterRecords && accountIds.length
        ? await countByWhere(AccountRequest, { accountId: { [Op.in]: accountIds } }, tx)
        : 0,
      complaints: args.deleteMasterRecords && accountIds.length
        ? await countByWhere(Complaint, { accountId: { [Op.in]: accountIds } }, tx)
        : 0,
      accountManagers: args.deleteMasterRecords && corporateIds.length
        ? await countByWhere(AccountManager, { corporateId: { [Op.in]: corporateIds } }, tx)
        : 0,
      personsByCorporate: args.deleteMasterRecords && corporateIds.length
        ? await countByWhere(Person, { corporateId: { [Op.in]: corporateIds } }, tx)
        : 0,
      importExecutives: args.deleteImportExecutives
        ? await countByWhere(ExecutiveStaff, { email: { [Op.like]: "%@import.local" } }, tx)
        : 0,
    };

    console.log("Delete plan:");
    console.log(`Sheet: ${sheetName}`);
    console.log(`Offset: ${args.offset}`);
    console.log(`Limit: ${args.limit || "all"}`);
    console.log(`Delete master records: ${args.deleteMasterRecords ? "yes" : "no"}`);
    console.log(`Corporate numbers targeted: ${corporateNumbers.length}`);
    Object.entries(counts).forEach(([key, value]) => console.log(`${key}: ${value}`));

    if (!args.apply) {
      console.log("\nDry-run only. Re-run with --apply to delete.");
      await tx.rollback();
      await sequelize.close();
      return;
    }

    if (targetedContractIds.length) {
      await destroyByWhere(Contract, { contractId: { [Op.in]: targetedContractIds } }, tx);
    }
    if (targetedServiceIds.length) {
      await destroyByWhere(Service, { serviceId: { [Op.in]: targetedServiceIds } }, tx);
    }

    if (args.deleteMasterRecords) {
      if (ticketIds.length) await destroyByWhere(TicketInternalNote, { ticketId: { [Op.in]: ticketIds } }, tx);
      if (accountIds.length) await destroyByWhere(ControlCard, { accountId: { [Op.in]: accountIds } }, tx);
      if (accountIds.length) await destroyByWhere(Visit, { accountId: { [Op.in]: accountIds } }, tx);
      if (ticketIds.length) await destroyByWhere(Ticket, { ticketId: { [Op.in]: ticketIds } }, tx);
      if (accountIds.length) await destroyByWhere(AccountRequest, { accountId: { [Op.in]: accountIds } }, tx);
      if (accountIds.length) await destroyByWhere(Complaint, { accountId: { [Op.in]: accountIds } }, tx);
      if (accountIds.length) await destroyByWhere(Invoice, { accountId: { [Op.in]: accountIds } }, tx);
      if (corporateIds.length) await destroyByWhere(AccountManager, { corporateId: { [Op.in]: corporateIds } }, tx);
      if (corporateIds.length) await destroyByWhere(Person, { corporateId: { [Op.in]: corporateIds } }, tx);
      if (accountIds.length) await destroyByWhere(Account, { accountId: { [Op.in]: accountIds } }, tx);
      if (corporateIds.length) await destroyByWhere(Corporate, { corporateId: { [Op.in]: corporateIds } }, tx);
    }

    if (args.deleteImportExecutives) {
      await destroyByWhere(ExecutiveStaff, { email: { [Op.like]: "%@import.local" } }, tx);
    }

    await tx.commit();
    await sequelize.close();
    console.log("\nDeletion completed successfully.");
  } catch (error) {
    await tx.rollback();
    await sequelize.close();
    console.error("Delete failed:", error.message);
    if (error.parent?.sqlMessage) console.error("SQL message:", error.parent.sqlMessage);
    process.exit(1);
  }
}

main();
