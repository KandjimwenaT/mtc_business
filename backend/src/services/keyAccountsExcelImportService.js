const XLSX = require("xlsx");
const { sequelize } = require("../config/database");
const Corporate = require("../models/Corporate");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Account = require("../models/Account");
const Service = require("../models/Service");
const Contract = require("../models/Contract");
const Manager = require("../models/Manager");
const Person = require("../models/Person");

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
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
    const hasAccountManager = row.some((cell) => cell.includes("accountmanager"));
    const hasBusinessOrCorporate = row.some(
      (cell) =>
        cell.includes("businessname") ||
        cell.includes("corporatename") ||
        cell.includes("companyname")
    );
    if (hasAccountManager && hasBusinessOrCorporate) {
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

function cleanDate(value) {
  const v = normalizeText(value);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
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
 * @param {string} [options.sheet] - sheet name; default first sheet
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.createMissingExecutives]
 * @param {boolean} [options.includeAccounts]
 * @param {boolean} [options.includeServices]
 * @param {boolean} [options.includeContracts]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @param {number} [options.assignedManagerProfileId] - managers.manager_id; when set, stamped on
 *   corporates/accounts for this batch and on newly created placeholder executives.
 * @param {(msg: string) => void} [options.onProgress] - optional; e.g. thousand-row progress
 */
async function runKeyAccountsImport(options) {
  const {
    workbookBuffer,
    sheet: sheetNameOpt = "",
    dryRun = false,
    createMissingExecutives = false,
    includeAccounts = false,
    includeServices = false,
    includeContracts = false,
    limit = 0,
    offset = 0,
    onProgress,
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

  const headers = Object.keys(rows[0]);
  const corporateNumberCol = pickColumn(headers, [
    "Active Business Number",
    "Business Number",
    "Corporate Number",
    "Account Number",
    "corporateNumber",
  ]);
  const corporateNameCol = pickColumn(headers, [
    "Business Name",
    "Corporate Name",
    "Company Name",
    "Account Name",
    "corporateName",
  ]);
  const accountManagerCol = pickColumn(headers, [
    "Account Manager",
    "AccountManager",
    "Executive",
    "Executive Staff",
  ]);
  const businessEmailCol = pickColumn(headers, [
    "Business Email",
    "Email",
    "Company Email",
  ]);
  const industryCol = pickColumn(headers, ["Industry", "Sector"]);
  const accountTypeCol = pickColumn(headers, ["Account Type", "ACCOUNT_TYPE", "Type"]);

  requireArg(
    corporateNumberCol,
    `Could not find business number column. Available headers: ${headers.join(", ")}`
  );
  requireArg(corporateNameCol, "Could not find business/corporate name column.");
  requireArg(accountManagerCol, "Could not find Account Manager column.");

  await sequelize.authenticate();
  if (assignedManagerProfileId != null && !dryRun) {
    const mgrRow = await Manager.findByPk(assignedManagerProfileId);
    if (!mgrRow) {
      throw new Error(
        `assignedManagerProfileId ${assignedManagerProfileId} is not a valid managers.manager_id`
      );
    }
  }
  if (!dryRun) {
    await ensureServiceMsisdnDuplicatesAllowed();
  }
  const executiveLookup = await buildExecutiveLookup();

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
    contractsCreated: 0,
    contractsUpdated: 0,
    corporateNameDedupHits: 0,
    accountNameDedupHits: 0,
    skippedServiceRows: 0,
  };

  const unresolved = [];
  const createdExecutives = [];
  const corporateByNameKey = new Map();
  const accountByNameKey = new Map();
  const execManagerIdCache = new Map();

  async function managerProfileIdFromExecutiveStaff(eId) {
    if (!eId) return null;
    if (execManagerIdCache.has(eId)) return execManagerIdCache.get(eId);
    if (dryRun) {
      execManagerIdCache.set(eId, null);
      return null;
    }
    const row = await ExecutiveStaff.findByPk(eId, { attributes: ["managerId"] });
    const mid = row?.managerId ?? null;
    execManagerIdCache.set(eId, mid);
    return mid;
  }

  /** MySQL FK: accounts.manager_id → persons.id. Map managers.manager_id via portal Manager email. */
  const managerProfileToAccountPersonId = new Map();
  async function accountPersonIdForManagerProfile(managerProfilePk) {
    if (!managerProfilePk) return null;
    if (managerProfileToAccountPersonId.has(managerProfilePk)) {
      return managerProfileToAccountPersonId.get(managerProfilePk);
    }
    if (dryRun) {
      managerProfileToAccountPersonId.set(managerProfilePk, null);
      return null;
    }
    const mgr = await Manager.findByPk(managerProfilePk);
    if (!mgr?.email) {
      managerProfileToAccountPersonId.set(managerProfilePk, null);
      return null;
    }
    const person = await Person.findOne({
      where: { email: mgr.email, type: "manager" },
      attributes: ["id"],
    });
    const pid = person?.id ?? null;
    managerProfileToAccountPersonId.set(managerProfilePk, pid);
    return pid;
  }

  const msisdnCol = pickColumn(headers, ["MSISDN", "Phone Number", "Service Number"]);
  const currentServiceOwnerCol = pickColumn(headers, [
    "CURRENT_SERVICE_OWNER",
    "Current Service Owner",
    "Current Owner",
  ]);
  const serviceStatusCol = pickColumn(headers, ["SERVICE_STATUS", "Service Status", "STATUS", "Status"]);
  const srNumberCol = pickColumn(headers, ["Sr Number", "SR Number", "srNumber"]);
  const contractTypeCol = pickColumn(headers, ["CONTRACT", "Contract", "Contract Type"]);
  const contractStartDateCol = pickColumn(headers, ["CONTRACT_START_DATE", "Contract Start Date"]);
  const contractEndDateCol = pickColumn(headers, ["CONTRACT_END_DATE", "Contract End Date"]);
  const contractEffectiveDateCol = pickColumn(
    headers,
    ["CONT_EFFECTIVE_END_DATE", "Contract Effective Date", "CONTRACT_EFFECTIVE_DATE"]
  );
  const srCreatedDateCol = pickColumn(headers, ["Sr Created Date and Time", "SR Created Date", "srCreatedDate"]);
  const srSubmittedDateCol = pickColumn(headers, ["Submited by", "Submitted Date", "srSubmittedDate"]);
  const srAcceptedDateCol = pickColumn(headers, ["Accepted Date", "srAcceptedDate"]);
  const usageLimitCol = pickColumn(headers, ["USAGE_LIMIT", "Usage Limit"]);
  const entitlementCol = pickColumn(headers, ["ENTITLEMENT_ID", "Entitlement", "Entitlement ID"]);

  let processed = 0;
  for (const row of selectedRows) {
    const corporateNumber = normalizeText(row[corporateNumberCol]);
    const corporateName = normalizeText(row[corporateNameCol]);
    const accountManagerRaw = normalizeText(row[accountManagerCol]);
    const businessEmail = normalizeText(row[businessEmailCol]);
    const industry = normalizeText(row[industryCol]);

    try {
      if (!corporateNumber || !corporateName || !accountManagerRaw) {
        stats.skipped += 1;
        continue;
      }

      const managerKey = normalizeName(accountManagerRaw);
      const accountNameKey = toKey(corporateName);
      let executiveId =
        executiveLookup.byEmail.get(managerKey) || executiveLookup.byName.get(managerKey) || null;

      if (!executiveId && createMissingExecutives && !dryRun) {
        const { firstName, lastName } = splitName(accountManagerRaw);
        const createdExecutive = await ExecutiveStaff.create({
          firstName,
          lastName,
          email: buildPlaceholderEmail(accountManagerRaw),
          ...(assignedManagerProfileId != null ? { managerId: assignedManagerProfileId } : {}),
        });
        executiveId = createdExecutive.executiveId;
        executiveLookup.byName.set(managerKey, executiveId);
        createdExecutives.push(`${firstName} ${lastName}`);
      }

      if (!executiveId) {
        stats.unresolvedExecutive += 1;
        unresolved.push({
          corporateNumber,
          corporateName,
          accountManager: accountManagerRaw,
        });
        continue;
      }

      const inferredManagerProfilePk = await managerProfileIdFromExecutiveStaff(executiveId);
      const corporateManagerProfilePk =
        assignedManagerProfileId != null ? assignedManagerProfileId : inferredManagerProfilePk ?? null;

      const accountManagerPersonId = await accountPersonIdForManagerProfile(corporateManagerProfilePk);

      const payload = {
        corporateName,
        corporateType: "key_account",
        businessEmail:
          businessEmail || `${corporateNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@placeholder.local`,
        industry: industry || null,
        executiveId,
        approvalStatus: "approved",
        isActive: true,
        ...(corporateManagerProfilePk != null ? { managerId: corporateManagerProfilePk } : {}),
      };

      let corporateRecord = corporateByNameKey.get(accountNameKey) || null;
      if (!corporateRecord) {
        const existingByName = await Corporate.findOne({ where: { corporateName } });
        const existingByNumber = existingByName
          ? null
          : await Corporate.findOne({ where: { corporateNumber } });
        const existing = existingByName || existingByNumber;
        if (dryRun) {
          if (existing) {
            stats.updated += 1;
            corporateRecord = existing;
          } else {
            stats.created += 1;
            corporateRecord = { corporateId: -(corporateByNameKey.size + 1), corporateNumber };
          }
        } else if (existing) {
          await existing.update(payload);
          stats.updated += 1;
          corporateRecord = existing;
        } else {
          corporateRecord = await Corporate.create({
            corporateNumber,
            ...payload,
          });
          stats.created += 1;
        }
        corporateByNameKey.set(accountNameKey, corporateRecord);
      } else {
        stats.corporateNameDedupHits += 1;
      }

      if (includeAccounts) {
        const accountNumber = corporateNumber;
        const accountName = corporateName;
        const accountType = normalizeText(row[accountTypeCol]) || "key_account";
        const accountPayload = {
          accountName,
          accountType,
          executiveId,
          managerId: accountManagerPersonId ?? null,
          corporateId: corporateRecord ? corporateRecord.corporateId : null,
          contactFirstName: "",
          contactLastName: "",
          contactEmail: businessEmail || "",
          contactPhone: null,
          industry: industry || null,
          isActive: true,
          approvalStatus: "approved",
        };

        let accountRecord = accountByNameKey.get(accountNameKey) || null;
        if (!accountRecord) {
          const existingByName = await Account.findOne({ where: { accountName } });
          const existingByNumber = existingByName ? null : await Account.findOne({ where: { accountNumber } });
          const existingAccount = existingByName || existingByNumber;
          if (dryRun) {
            if (existingAccount) {
              stats.accountsUpdated += 1;
              accountRecord = existingAccount;
            } else {
              stats.accountsCreated += 1;
              accountRecord = { accountId: accountByNameKey.size + 1, accountNumber };
            }
          } else if (existingAccount) {
            await existingAccount.update(accountPayload);
            stats.accountsUpdated += 1;
            accountRecord = existingAccount;
          } else {
            accountRecord = await Account.create({
              accountNumber,
              ...accountPayload,
            });
            stats.accountsCreated += 1;
          }
          accountByNameKey.set(accountNameKey, accountRecord);
        } else {
          stats.accountNameDedupHits += 1;
        }

        const accountId = accountRecord?.accountId || null;

        if (includeServices && accountId) {
          const msisdn = normalizeText(row[msisdnCol]);
          if (!msisdn) {
            stats.skippedServiceRows += 1;
            continue;
          }
          const serviceType = normalizeText(row[contractTypeCol]) || "mobile";
          const currentServiceOwner = normalizeText(row[currentServiceOwnerCol]) || null;
          const serviceStatus = mapServiceStatus(row[serviceStatusCol]);
          const servicePayload = {
            accountId,
            msisdn: msisdn || null,
            serviceType,
            currentServiceOwner,
            status: serviceStatus,
          };

          let serviceId = null;
          if (dryRun) {
            stats.servicesCreated += 1;
          } else {
            const createdService = await Service.create(servicePayload);
            stats.servicesCreated += 1;
            serviceId = createdService.serviceId;
          }

          if (includeContracts) {
            const srNumber = normalizeText(row[srNumberCol]) || null;
            const contractType = normalizeText(row[contractTypeCol]) || "standard";
            const contractPayload = {
              accountId,
              serviceId,
              contractType,
              contractStartDate: cleanDate(row[contractStartDateCol]),
              contractEndDate: cleanDate(row[contractEndDateCol]),
              contractEffectiveDate: cleanDate(row[contractEffectiveDateCol]),
              srNumber,
              srCreatedDate: cleanDate(row[srCreatedDateCol]),
              srSubmittedDate: cleanDate(row[srSubmittedDateCol]),
              srAcceptedDate: cleanDate(row[srAcceptedDateCol]),
              usageLimit: normalizeText(row[usageLimitCol]) || null,
              entitlement: normalizeText(row[entitlementCol]) || null,
              notes: "Imported from key accounts Excel",
            };

            if (dryRun) {
              stats.contractsCreated += 1;
            } else {
              await Contract.create(contractPayload);
              stats.contractsCreated += 1;
            }
          }
        } else if (includeContracts && accountId) {
          const srNumber = normalizeText(row[srNumberCol]) || null;
          const contractType = normalizeText(row[contractTypeCol]) || "standard";
          const contractPayload = {
            accountId,
            serviceId: null,
            contractType,
            contractStartDate: cleanDate(row[contractStartDateCol]),
            contractEndDate: cleanDate(row[contractEndDateCol]),
            contractEffectiveDate: cleanDate(row[contractEffectiveDateCol]),
            srNumber,
            srCreatedDate: cleanDate(row[srCreatedDateCol]),
            srSubmittedDate: cleanDate(row[srSubmittedDateCol]),
            srAcceptedDate: cleanDate(row[srAcceptedDateCol]),
            usageLimit: normalizeText(row[usageLimitCol]) || null,
            entitlement: normalizeText(row[entitlementCol]) || null,
            notes: "Imported from key accounts Excel",
          };
          const contractWhere = { accountId };
          if (srNumber) contractWhere.srNumber = srNumber;
          else contractWhere.contractType = contractType;
          const existingContract = await Contract.findOne({ where: contractWhere });
          if (dryRun) {
            if (existingContract) stats.contractsUpdated += 1;
            else stats.contractsCreated += 1;
          } else if (existingContract) {
            await existingContract.update(contractPayload);
            stats.contractsUpdated += 1;
          } else {
            await Contract.create(contractPayload);
            stats.contractsCreated += 1;
          }
        }
      }
      processed += 1;
      if (onProgress && processed % 1000 === 0) {
        onProgress(`Processed ${processed}/${selectedRows.length} rows...`);
      }
    } catch (rowError) {
      rowError.rowContext = {
        corporateNumber,
        corporateName,
        accountManager: accountManagerRaw,
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

module.exports = {
  runKeyAccountsImport,
};
