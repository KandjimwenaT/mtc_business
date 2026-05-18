#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Deletes every corporate, all accounts linked to those corporates, and related
 * services, contracts, tickets, invoices, etc. Staff users (users table) are not removed.
 * Also removes Excel-import placeholder executives (*@import.local with no linked user).
 * Also removes Excel-import placeholder executives (*@import.local with no linked user).
 *
 * Usage (from repo root or backend — prefer backend so .env resolves):
 *   cd backend && node scripts/purgeAllCorporatesAndAccounts.js           # dry run (counts only)
 *   cd backend && node scripts/purgeAllCorporatesAndAccounts.js --apply   # execute deletes
 */
require("dotenv").config();

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
const TicketActivityLog = require("../src/models/TicketActivityLog");
const AccountRequest = require("../src/models/AccountRequest");
const Complaint = require("../src/models/Complaint");
const AccountManager = require("../src/models/AccountManager");
const Person = require("../src/models/Person");
const CorporateContactPerson = require("../src/models/CorporateContactPerson");
const ExecutiveStaff = require("../src/models/ExecutiveStaff");

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--apply") args.apply = true;
  }
  return args;
}

/** Account rows with parent links: delete leaves first to satisfy self-FK. */
function accountDeletionBatches(accountRows) {
  const byId = new Map(accountRows.map((a) => [a.accountId, a]));
  let remaining = new Set(accountRows.map((a) => a.accountId));
  const batches = [];
  while (remaining.size) {
    const referencedAsParent = new Set();
    for (const id of remaining) {
      const parentId = byId.get(id)?.parentAccountId;
      if (parentId && remaining.has(parentId)) referencedAsParent.add(parentId);
    }
    const leaves = [...remaining].filter((id) => !referencedAsParent.has(id));
    if (leaves.length === 0) {
      batches.push([...remaining]);
      break;
    }
    batches.push(leaves);
    for (const id of leaves) remaining.delete(id);
  }
  return batches;
}

async function main() {
  const args = parseArgs(process.argv);

  await sequelize.authenticate();

  const tx = await sequelize.transaction();
  try {
    const corporates = await Corporate.findAll({
      attributes: ["corporateId", "corporateNumber", "corporateName"],
      transaction: tx,
    });
    const corporateIds = corporates.map((c) => c.corporateId);

    if (corporateIds.length === 0) {
      console.log("No corporates in database. Nothing to do.");
      await tx.rollback();
      await sequelize.close();
      return;
    }

    const accounts = await Account.findAll({
      where: { corporateId: { [Op.in]: corporateIds } },
      attributes: ["accountId", "parentAccountId"],
      transaction: tx,
    });
    const accountIds = accounts.map((a) => a.accountId);

    const services = accountIds.length
      ? await Service.findAll({
          where: { accountId: { [Op.in]: accountIds } },
          attributes: ["serviceId"],
          transaction: tx,
        })
      : [];
    const serviceIds = services.map((s) => s.serviceId);

    const contractConditions = [
      accountIds.length ? { accountId: { [Op.in]: accountIds } } : null,
      serviceIds.length ? { serviceId: { [Op.in]: serviceIds } } : null,
    ].filter(Boolean);
    const contractWhere = contractConditions.length ? { [Op.or]: contractConditions } : null;

    const tickets = accountIds.length
      ? await Ticket.findAll({
          where: { accountId: { [Op.in]: accountIds } },
          attributes: ["ticketId"],
          transaction: tx,
        })
      : [];
    const ticketIds = tickets.map((t) => t.ticketId);

    const invoiceWhere =
      accountIds.length || corporateIds.length
        ? {
            [Op.or]: [
              accountIds.length ? { accountId: { [Op.in]: accountIds } } : null,
              { corporateId: { [Op.in]: corporateIds } },
            ].filter(Boolean),
          }
        : null;

    const importExecutiveWhere = {
      [Op.and]: [{ email: { [Op.like]: "%@import.local" } }, { userId: null }],
    };

    const counts = {
      corporates: corporates.length,
      accounts: accountIds.length,
      services: serviceIds.length,
      contracts: contractWhere ? await Contract.count({ where: contractWhere, transaction: tx }) : 0,
      ticketActivityLogs: ticketIds.length
        ? await TicketActivityLog.count({ where: { ticketId: { [Op.in]: ticketIds } }, transaction: tx })
        : 0,
      ticketInternalNotes: ticketIds.length
        ? await TicketInternalNote.count({ where: { ticketId: { [Op.in]: ticketIds } }, transaction: tx })
        : 0,
      tickets: ticketIds.length,
      controlCards: accountIds.length
        ? await ControlCard.count({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx })
        : 0,
      visits: accountIds.length
        ? await Visit.count({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx })
        : 0,
      accountRequests: accountIds.length
        ? await AccountRequest.count({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx })
        : 0,
      complaints: accountIds.length
        ? await Complaint.count({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx })
        : 0,
      invoices: invoiceWhere
        ? await Invoice.count({ where: invoiceWhere, transaction: tx })
        : 0,
      corporateContactPersons: await CorporateContactPerson.count({
        where: { corporateId: { [Op.in]: corporateIds } },
        transaction: tx,
      }),
      accountManagers: await AccountManager.count({
        where: { corporateId: { [Op.in]: corporateIds } },
        transaction: tx,
      }),
      persons: await Person.count({
        where: { corporateId: { [Op.in]: corporateIds } },
        transaction: tx,
      }),
      pendingImportExecutives: await ExecutiveStaff.count({
        where: importExecutiveWhere,
        transaction: tx,
      }),
    };

    console.log("Purge plan (all rows tied to corporates / their accounts):\n");
    Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log("\nSample corporates (up to 5):");
    corporates.slice(0, 5).forEach((c) => {
      console.log(`  ${c.corporateNumber} — ${c.corporateName} (id ${c.corporateId})`);
    });
    if (corporates.length > 5) console.log(`  … and ${corporates.length - 5} more`);

    if (!args.apply) {
      console.log("\nDry-run only. Re-run with --apply to delete this data permanently.");
      await tx.rollback();
      await sequelize.close();
      return;
    }

    if (ticketIds.length) {
      await TicketActivityLog.destroy({ where: { ticketId: { [Op.in]: ticketIds } }, transaction: tx });
      await TicketInternalNote.destroy({ where: { ticketId: { [Op.in]: ticketIds } }, transaction: tx });
    }

    if (contractWhere) {
      await Contract.destroy({ where: contractWhere, transaction: tx });
    }
    if (accountIds.length) {
      await ControlCard.destroy({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx });
      await Visit.destroy({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx });
      await AccountRequest.destroy({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx });
      await Complaint.destroy({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx });
    }
    if (invoiceWhere) {
      await Invoice.destroy({ where: invoiceWhere, transaction: tx });
    }
    if (ticketIds.length) {
      await Ticket.destroy({ where: { ticketId: { [Op.in]: ticketIds } }, transaction: tx });
    }
    if (accountIds.length) {
      await Service.destroy({ where: { accountId: { [Op.in]: accountIds } }, transaction: tx });
    }

    const batches = accountDeletionBatches(accounts);
    for (const batch of batches) {
      await Account.destroy({ where: { accountId: { [Op.in]: batch } }, transaction: tx });
    }

    await CorporateContactPerson.destroy({
      where: { corporateId: { [Op.in]: corporateIds } },
      transaction: tx,
    });
    await AccountManager.destroy({
      where: { corporateId: { [Op.in]: corporateIds } },
      transaction: tx,
    });
    await Person.destroy({
      where: { corporateId: { [Op.in]: corporateIds } },
      transaction: tx,
    });
    await Corporate.destroy({
      where: { corporateId: { [Op.in]: corporateIds } },
      transaction: tx,
    });

    await ExecutiveStaff.destroy({
      where: importExecutiveWhere,
      transaction: tx,
    });

    await tx.commit();
    await sequelize.close();
    console.log("\nPurge completed successfully.");
  } catch (error) {
    await tx.rollback();
    await sequelize.close();
    console.error("Purge failed:", error.message);
    if (error.parent?.sqlMessage) console.error("SQL message:", error.parent.sqlMessage);
    process.exit(1);
  }
}

main();
