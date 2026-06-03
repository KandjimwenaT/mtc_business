const XLSX = require("xlsx");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Corporate = require("../models/Corporate");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Account = require("../models/Account");
const Service = require("../models/Service");
const Manager = require("../models/Manager");
const Person = require("../models/Person");

// EBU customer list importer.
//
// Sheet shape (see /Users/Tangi/Documents/2026 Documents/EBU Customer List.xlsx,
// sheet name is literally "Update " with a trailing space):
//
//   Customer ID | Service Code | Customer Name | Customer Contact No |
//   Customer Email | Customer  address | Site Name | Region | FM Office |
//   CSE Name | CSE Telephone | Service Status | Service Type
//
// One Corporate per Customer Name. One Account per (Customer Name + Site Name).
// One Service per row (Service Code stored on Service.msisdn). No Contracts.

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  // Trim regular spaces plus stray tabs/CR/LF that show up in some CSE cells.
  return String(value || "").replace(/[\t\r\n]+/g, " ").trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalizeName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function detectHeaderRow(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  for (let i = 0; i < Math.min(matrix.length, 30); i += 1) {
    const row = matrix[i].map((cell) => normalizeHeader(cell));
    const hasCustomerName = row.some(
      (cell) => cell === "customername" || cell.includes("customername")
    );
    const hasServiceCode = row.some((cell) => cell.includes("servicecode"));
    if (hasCustomerName && hasServiceCode) {
      return i;
    }
  }
  return 0;
}

async function buildExecutiveLookup() {
  const executives = await ExecutiveStaff.findAll({
    attributes: ["executiveId", "firstName", "lastName", "email"],
  });
  const byName = new Map();
  const byEmail = new Map();
  for (const exec of executives) {
    const fullName = normalizeName(`${exec.firstName} ${exec.lastName}`);
    if (fullName) byName.set(fullName, exec.executiveId);
    if (exec.email) byEmail.set(normalizeName(exec.email), exec.executiveId);
  }
  return { byName, byEmail };
}

function splitName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Unknown" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function buildPlaceholderEmail(name) {
  const slug = normalizeName(name).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  const base = slug || `executive.${Date.now()}`;
  return `${base}@import.local`;
}

function mapServiceStatus(rawStatus) {
  const value = normalizeText(rawStatus).toLowerCase();
  if (["active", "activated", "inservice"].includes(value)) return "active";
  if (["suspended", "barred"].includes(value)) return "suspended";
  return "inactive";
}

function requireArg(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureServiceMsisdnDuplicatesAllowed() {
  const queryInterface = sequelize.getQueryInterface();
  const indexes = await queryInterface.showIndex("services");
  const uniqueMsisdnIndex = indexes.find((idx) => idx.name === "unique_msisdn");
  if (uniqueMsisdnIndex) {
    await queryInterface.removeIndex("services", "unique_msisdn");
    // eslint-disable-next-line no-console
    console.log("Dropped unique index `unique_msisdn` on services.msisdn (duplicates now allowed).");
  }
}

/**
 * @param {object} options
 * @param {Buffer} options.workbookBuffer
 * @param {string} [options.sheet]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.createMissingExecutives]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @param {number} options.assignedManagerProfileId - REQUIRED for EBU. The
 *   chosen managers.manager_id is stamped on every Corporate/Account and on
 *   placeholder ExecutiveStaff rows created for unresolved CSE names.
 * @param {(msg: string) => void} [options.onProgress]
 * @param {(processed: number, total: number) => void} [options.onProgressRow]
 */
async function runEbuImport(options) {
  const {
    workbookBuffer,
    sheet: sheetNameOpt = "",
    dryRun = false,
    createMissingExecutives = false,
    limit = 0,
    offset = 0,
    onProgress,
    onProgressRow,
    assignedManagerProfileId: assignedManagerOpt = null,
  } = options;

  requireArg(
    workbookBuffer && Buffer.isBuffer(workbookBuffer) && workbookBuffer.length > 0,
    "Missing or empty workbook buffer"
  );

  const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
  const sheetName = sheetNameOpt || workbook.SheetNames[0];
  requireArg(!!workbook.Sheets[sheetName], `Sheet not found: ${sheetName}`);

  const headerRowIndex = detectHeaderRow(workbook.Sheets[sheetName]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    range: headerRowIndex,
  });
  requireArg(rows.length > 0, "No rows found in the selected sheet.");

  const parsedAssignedManager =
    assignedManagerOpt != null && assignedManagerOpt !== ""
      ? Number(assignedManagerOpt)
      : null;
  const assignedManagerProfileId =
    parsedAssignedManager != null &&
    Number.isInteger(parsedAssignedManager) &&
    parsedAssignedManager > 0
      ? parsedAssignedManager
      : null;

  requireArg(
    assignedManagerProfileId != null,
    "assignedManagerProfileId is required for EBU imports"
  );

  const headers = Object.keys(rows[0]);
  const customerIdCol = pickColumn(headers, ["Customer ID", "CustomerID", "Customer Id"]);
  const customerNameCol = pickColumn(headers, ["Customer Name", "CustomerName"]);
  const customerEmailCol = pickColumn(headers, ["Customer Email", "Email"]);
  const customerPhoneCol = pickColumn(headers, [
    "Customer Contact No",
    "Customer Contact",
    "Customer Phone",
    "Contact Number",
  ]);
  const customerAddressCol = pickColumn(headers, [
    "Customer  address",
    "Customer address",
    "Address",
  ]);
  const siteNameCol = pickColumn(headers, ["Site Name", "Site"]);
  const regionCol = pickColumn(headers, ["Region"]);
  const cseNameCol = pickColumn(headers, ["CSE Name", "CSE", "Executive", "Account Manager"]);
  const csePhoneCol = pickColumn(headers, ["CSE Telephone", "CSE Phone", "Executive Phone"]);
  const serviceStatusCol = pickColumn(headers, ["Service Status", "Status"]);
  const serviceTypeCol = pickColumn(headers, ["Service Type", "Type"]);
  const serviceCodeCol = pickColumn(headers, ["Service Code", "ServiceCode"]);

  requireArg(customerNameCol, `Could not find Customer Name column. Headers: ${headers.join(", ")}`);
  requireArg(serviceCodeCol, "Could not find Service Code column.");

  await sequelize.authenticate();
  if (!dryRun) {
    const mgrRow = await Manager.findByPk(assignedManagerProfileId);
    if (!mgrRow) {
      throw new Error(
        `assignedManagerProfileId ${assignedManagerProfileId} is not a valid managers.manager_id`
      );
    }
    await ensureServiceMsisdnDuplicatesAllowed();
  }

  const executiveLookup = await buildExecutiveLookup();

  // accounts.manager_id is a FK to persons.id; resolve the portal manager's
  // matching Person record so we can stamp it on each EBU account.
  let accountManagerPersonId = null;
  if (!dryRun) {
    const mgr = await Manager.findByPk(assignedManagerProfileId);
    if (mgr?.email) {
      const person = await Person.findOne({
        where: { email: mgr.email, type: "manager" },
        attributes: ["id"],
      });
      accountManagerPersonId = person?.id ?? null;
    }
  }

  const selectedRows = rows.slice(offset, limit > 0 ? offset + limit : undefined);

  const stats = {
    totalRows: selectedRows.length,
    skipped: 0,
    unresolvedExecutive: 0,
    created: 0,
    updated: 0,
    accountsCreated: 0,
    accountsUpdated: 0,
    servicesCreated: 0,
    servicesUpdated: 0,
    corporateNameDedupHits: 0,
    accountNameDedupHits: 0,
    skippedServiceRows: 0,
  };

  const unresolved = [];
  const createdExecutives = [];
  const corporateByNameKey = new Map();
  const accountByCompositeKey = new Map();
  const usedAccountNumbers = new Set();

  // EBU sheets frequently share one contact email across multiple customers
  // (e.g. one finance person handling several entities). `corporates.business_email`
  // is UNIQUE in the DB, so a naive upsert blows up on the second customer that
  // shares the email. We keep the first claim and fall back to a deterministic
  // per-corporate placeholder for any subsequent customer that would collide.
  // `usedBusinessEmails` tracks claims made in this same batch; DB lookups
  // cover collisions with rows from earlier imports or non-EBU corporates.
  const usedBusinessEmails = new Map(); // email -> corporateId | "pending"

  function buildBusinessEmailPlaceholder({ corporateNumber: cn, corporateName: name }) {
    const slug =
      slugify(cn) || slugify(name) || `ebu.${Date.now()}`;
    return `${slug}@placeholder.local`;
  }

  async function resolveSafeBusinessEmail(desired, { corporateName: name, corporateNumber: cn, ownCorporateId }) {
    const placeholder = buildBusinessEmailPlaceholder({ corporateNumber: cn, corporateName: name });
    const candidate = (desired || "").trim();
    if (!candidate) return placeholder;

    const claimedBy = usedBusinessEmails.get(candidate);
    if (claimedBy != null && claimedBy !== ownCorporateId) {
      return placeholder;
    }

    if (!dryRun) {
      const collision = await Corporate.findOne({
        where: {
          businessEmail: candidate,
          ...(ownCorporateId != null ? { corporateId: { [Op.ne]: ownCorporateId } } : {}),
        },
        attributes: ["corporateId"],
      });
      if (collision) {
        return placeholder;
      }
    }

    usedBusinessEmails.set(candidate, ownCorporateId ?? "pending");
    return candidate;
  }

  async function reserveAccountNumber(baseNumber) {
    let candidate = baseNumber;
    let suffix = 1;
    if (!dryRun) {
      while (usedAccountNumbers.has(candidate) || (await Account.findOne({ where: { accountNumber: candidate } }))) {
        suffix += 1;
        candidate = `${baseNumber}-${suffix}`;
      }
    } else {
      while (usedAccountNumbers.has(candidate)) {
        suffix += 1;
        candidate = `${baseNumber}-${suffix}`;
      }
    }
    usedAccountNumbers.add(candidate);
    return candidate;
  }

  let processed = 0;
  for (const row of selectedRows) {
    const customerName = normalizeText(row[customerNameCol]);
    const customerId = customerIdCol ? normalizeText(row[customerIdCol]) : "";
    const customerEmail = customerEmailCol ? normalizeText(row[customerEmailCol]) : "";
    const customerPhone = customerPhoneCol ? normalizeText(row[customerPhoneCol]) : "";
    const customerAddress = customerAddressCol ? normalizeText(row[customerAddressCol]) : "";
    const siteName = siteNameCol ? normalizeText(row[siteNameCol]) : "";
    const region = regionCol ? normalizeText(row[regionCol]) : "";
    const cseName = cseNameCol ? normalizeText(row[cseNameCol]) : "";
    const csePhone = csePhoneCol ? normalizeText(row[csePhoneCol]) : "";
    const serviceCode = normalizeText(row[serviceCodeCol]);
    const serviceStatus = serviceStatusCol ? normalizeText(row[serviceStatusCol]) : "";
    const serviceType = serviceTypeCol ? normalizeText(row[serviceTypeCol]) : "";

    try {
      if (!customerName) {
        stats.skipped += 1;
        continue;
      }

      const corporateNameKey = normalizeName(customerName);
      const corporateNumber = customerId || slugify(customerName);

      // Executive: optional. When CSE Name is blank we still create the
      // Corporate/Account but leave executiveId null (the manager owns it).
      let executiveId = null;
      if (cseName) {
        const cseKey = normalizeName(cseName);
        executiveId =
          executiveLookup.byEmail.get(cseKey) || executiveLookup.byName.get(cseKey) || null;
        if (!executiveId && createMissingExecutives && !dryRun) {
          const { firstName, lastName } = splitName(cseName);
          const createdExecutive = await ExecutiveStaff.create({
            firstName,
            lastName,
            email: buildPlaceholderEmail(cseName),
            phone: csePhone || null,
            managerId: assignedManagerProfileId,
          });
          executiveId = createdExecutive.executiveId;
          executiveLookup.byName.set(cseKey, executiveId);
          createdExecutives.push(`${firstName} ${lastName}`);
        }
        if (!executiveId) {
          stats.unresolvedExecutive += 1;
          unresolved.push({ corporateNumber, corporateName: customerName, accountManager: cseName });
        }
      }

      let corporateRecord = corporateByNameKey.get(corporateNameKey) || null;
      if (!corporateRecord) {
        const existingByName = await Corporate.findOne({ where: { corporateName: customerName } });
        const existingByNumber =
          existingByName || !corporateNumber
            ? null
            : await Corporate.findOne({ where: { corporateNumber } });
        const existing = existingByName || existingByNumber;

        const safeBusinessEmail = await resolveSafeBusinessEmail(customerEmail, {
          corporateName: customerName,
          corporateNumber,
          ownCorporateId: existing ? existing.corporateId : null,
        });

        const corporatePayload = {
          corporateName: customerName,
          corporateType: "ebu",
          businessEmail: safeBusinessEmail,
          industry: null,
          ...(executiveId != null ? { executiveId } : {}),
          approvalStatus: "approved",
          isActive: true,
          managerId: assignedManagerProfileId,
        };

        if (dryRun) {
          if (existing) {
            stats.updated += 1;
            corporateRecord = existing;
          } else {
            stats.created += 1;
            corporateRecord = { corporateId: -(corporateByNameKey.size + 1), corporateNumber };
          }
        } else if (existing) {
          await existing.update(corporatePayload);
          stats.updated += 1;
          corporateRecord = existing;
        } else {
          corporateRecord = await Corporate.create({
            corporateNumber,
            ...corporatePayload,
          });
          stats.created += 1;
        }
        // Backfill the email -> corporateId mapping once we know the id.
        if (corporateRecord?.corporateId != null) {
          usedBusinessEmails.set(safeBusinessEmail, corporateRecord.corporateId);
        }
        corporateByNameKey.set(corporateNameKey, corporateRecord);
      } else {
        stats.corporateNameDedupHits += 1;
      }

      const siteLabel = siteName || "Default";
      const accountCompositeKey = `${corporateNameKey}::${normalizeName(siteLabel)}`;
      let accountRecord = accountByCompositeKey.get(accountCompositeKey) || null;
      if (!accountRecord) {
        const accountName = `${customerName} — ${siteLabel}${region ? ` (${region})` : ""}`;
        const baseAccountNumber = `${corporateNumber || slugify(customerName)}-${slugify(siteLabel) || "site"}`;
        const accountPayload = {
          accountName,
          accountType: "ebu",
          ...(executiveId != null ? { executiveId } : {}),
          managerId: accountManagerPersonId ?? null,
          corporateId: corporateRecord ? corporateRecord.corporateId : null,
          contactFirstName: "",
          contactLastName: "",
          contactEmail: customerEmail || "",
          contactPhone: customerPhone || null,
          industry: customerAddress || null,
          isActive: true,
          approvalStatus: "approved",
        };

        const existingByName = await Account.findOne({ where: { accountName } });
        if (dryRun) {
          if (existingByName) {
            stats.accountsUpdated += 1;
            accountRecord = existingByName;
          } else {
            stats.accountsCreated += 1;
            accountRecord = { accountId: accountByCompositeKey.size + 1 };
          }
        } else if (existingByName) {
          await existingByName.update(accountPayload);
          stats.accountsUpdated += 1;
          accountRecord = existingByName;
        } else {
          const accountNumber = await reserveAccountNumber(baseAccountNumber);
          accountRecord = await Account.create({
            accountNumber,
            ...accountPayload,
          });
          stats.accountsCreated += 1;
        }
        accountByCompositeKey.set(accountCompositeKey, accountRecord);
      } else {
        stats.accountNameDedupHits += 1;
      }

      const accountId = accountRecord?.accountId || null;
      if (accountId && serviceCode) {
        const servicePayload = {
          accountId,
          msisdn: serviceCode,
          serviceType: serviceType || "ebu_service",
          currentServiceOwner: cseName || null,
          status: mapServiceStatus(serviceStatus),
        };
        if (dryRun) {
          stats.servicesCreated += 1;
        } else {
          await Service.create(servicePayload);
          stats.servicesCreated += 1;
        }
      } else if (accountId && !serviceCode) {
        stats.skippedServiceRows += 1;
      }

      processed += 1;
      if (onProgress && processed % 1000 === 0) {
        onProgress(`Processed ${processed}/${selectedRows.length} rows...`);
      }
      if (onProgressRow && (processed % 25 === 0 || processed === selectedRows.length)) {
        try {
          onProgressRow(processed, selectedRows.length);
        } catch (_) {
          // Never let a buggy progress listener break the import.
        }
      }
    } catch (rowError) {
      rowError.rowContext = {
        corporateNumber: customerId || slugify(customerName),
        corporateName: customerName,
        accountManager: cseName,
      };
      throw rowError;
    }
  }

  return {
    sheetName,
    offset,
    limit,
    stats,
    unresolved,
    createdExecutives,
  };
}

function countEbuRows({ workbookBuffer, sheet: sheetNameOpt = "" } = {}) {
  requireArg(
    workbookBuffer && Buffer.isBuffer(workbookBuffer) && workbookBuffer.length > 0,
    "Missing or empty workbook buffer"
  );
  const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
  const sheetName = sheetNameOpt || workbook.SheetNames[0];
  requireArg(!!workbook.Sheets[sheetName], `Sheet not found: ${sheetName}`);

  const headerRowIndex = detectHeaderRow(workbook.Sheets[sheetName]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    range: headerRowIndex,
  });
  return { sheetName, totalRows: rows.length };
}

module.exports = {
  runEbuImport,
  countEbuRows,
};
