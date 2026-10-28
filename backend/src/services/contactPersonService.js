// Helpers for the multi-corporate contact-person model.
//
// A contact person is stored as an AccountManager record. They can be linked
// to multiple corporates through two paths:
//   1. The legacy AccountManager.corporateId column (their "primary" corporate).
//   2. The corporate_contact_persons junction table (additional corporates).
//
// The helpers below abstract that union so the rest of the codebase doesn't
// need to know which storage was used to record a particular link.

const AccountManager = require("../models/AccountManager");
const CorporateContactPerson = require("../models/CorporateContactPerson");
const Corporate = require("../models/Corporate");
const Account = require("../models/Account");

const isInt = (v) => Number.isInteger(v);

async function getCorporateIdsForAccountManager(accountManager) {
  if (!accountManager) return [];
  const ids = new Set();
  if (isInt(accountManager.corporateId)) ids.add(accountManager.corporateId);
  const links = await CorporateContactPerson.findAll({
    where: { accountManagerId: accountManager.accountManagerId },
    attributes: ["corporateId"],
  });
  for (const link of links) {
    if (isInt(link.corporateId)) ids.add(link.corporateId);
  }
  return [...ids];
}

async function getCorporateIdsForCustomerUser(userEmail) {
  if (!userEmail) return [];
  const am = await AccountManager.findOne({ where: { email: userEmail } });
  if (!am) return [];
  return getCorporateIdsForAccountManager(am);
}

async function getAccountManagerForCustomerUser(userEmail) {
  if (!userEmail) return null;
  return AccountManager.findOne({ where: { email: userEmail } });
}

function accountApprovalFromCorporate(status) {
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

// A corporate created without a child account still needs one so the linked
// customer can open the portal. Reuses {corporateNumber}-default when free.
async function ensureDefaultAccountForCorporate(corporateOrId, contactPerson) {
  const corporate = corporateOrId && corporateOrId.corporateId
    ? corporateOrId
    : await Corporate.findByPk(corporateOrId);
  if (!corporate?.corporateId) return null;

  const existing = await Account.findOne({ where: { corporateId: corporate.corporateId } });
  if (existing) return existing;

  let contact = contactPerson || null;
  if (!contact) {
    const people = await getContactPersonsForCorporate(corporate.corporateId);
    contact = people[0] || null;
  }

  const email = String(contact?.email || corporate.businessEmail || "").trim();
  if (!email) return null;

  const baseNumber = String(corporate.corporateNumber || `CORP${corporate.corporateId}`).trim();
  let accountNumber = `${baseNumber}-default`;
  const numberTaken = await Account.findOne({ where: { accountNumber } });
  if (numberTaken) accountNumber = `${baseNumber}-default-${corporate.corporateId}`;

  try {
    return await Account.create({
      corporateId: corporate.corporateId,
      accountNumber,
      accountName: corporate.corporateName,
      accountType: corporate.corporateType || "Corporate",
      executiveId: corporate.executiveId || null,
      managerId: corporate.managerId || null,
      contactFirstName: String(contact?.firstName || "Corporate").trim() || "Corporate",
      contactLastName: String(contact?.lastName || "Contact").trim() || "Contact",
      contactEmail: email,
      contactPhone: contact?.phone || null,
      industry: corporate.industry || null,
      isActive: corporate.isActive !== false,
      approvalStatus: accountApprovalFromCorporate(corporate.approvalStatus),
    });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      return Account.findOne({ where: { corporateId: corporate.corporateId } });
    }
    throw err;
  }
}

// Returns every Account linked to any corporate the given customer user has
// access to (via primary AccountManager.corporateId or the junction table).
async function getAccountsForCustomerUser(userEmail) {
  const accountManager = await getAccountManagerForCustomerUser(userEmail);
  if (!accountManager) return [];
  const ids = await getCorporateIdsForAccountManager(accountManager);
  if (ids.length === 0) return [];

  const corporates = await Corporate.findAll({ where: { corporateId: ids } });
  for (const corporate of corporates) {
    await ensureDefaultAccountForCorporate(corporate, accountManager);
  }

  return Account.findAll({
    where: { corporateId: ids },
    order: [["created_at", "DESC"]],
  });
}

// Returns the accountManagerIds of every contact person linked to the given
// corporate (legacy primary link + junction-table links, deduped).
async function getAccountManagerIdsForCorporate(corporateId) {
  if (!isInt(Number(corporateId))) return [];
  const numericId = Number(corporateId);
  const [primary, junction] = await Promise.all([
    AccountManager.findAll({ where: { corporateId: numericId }, attributes: ["accountManagerId"] }),
    CorporateContactPerson.findAll({ where: { corporateId: numericId }, attributes: ["accountManagerId"] }),
  ]);
  const ids = new Set();
  for (const a of primary) ids.add(a.accountManagerId);
  for (const j of junction) ids.add(j.accountManagerId);
  return [...ids];
}

// Returns every contact person (AccountManager) linked to the given corporate.
async function getContactPersonsForCorporate(corporateId) {
  const ids = await getAccountManagerIdsForCorporate(corporateId);
  if (ids.length === 0) return [];
  return AccountManager.findAll({ where: { accountManagerId: ids } });
}

function isContactPlaceholderOrEmpty(account) {
  if (!account) return true;
  const fn = (account.contactFirstName || "").trim();
  const ln = (account.contactLastName || "").trim();
  const em = (account.contactEmail || "").trim().toLowerCase();
  if (!fn && !ln && !em) return true;
  if (fn === "Imported" && ln === "Contact") return true;
  if (fn === "Corporate" && ln === "Contact") return true;
  if (em.endsWith("@placeholder.local") || em.endsWith(".contact@placeholder.local")) return true;
  return false;
}

// Copies the contact info from the given AccountManager onto every child
// account of the corporate that currently has missing or import-placeholder
// contact data. Existing real contacts are left alone.
async function propagateContactPersonToCorporateAccounts(corporateId, accountManager) {
  if (!corporateId || !accountManager) return 0;
  const accounts = await Account.findAll({ where: { corporateId } });
  let updated = 0;
  for (const acc of accounts) {
    if (!isContactPlaceholderOrEmpty(acc)) continue;
    await acc.update({
      contactFirstName: accountManager.firstName || "",
      contactLastName: accountManager.lastName || "",
      contactEmail: accountManager.email || "",
      contactPhone: accountManager.phone || acc.contactPhone || null,
    });
    updated += 1;
  }
  return updated;
}

// Builds a map of corporateId → "primary contact" AccountManager. Prefers a
// directly-linked AM (AccountManager.corporateId) and falls back to the first
// junction-linked AM if none is set as primary.
async function buildCorporatePrimaryContactMap(corporateIds) {
  const validIds = [...new Set(corporateIds.filter((id) => isInt(id)))];
  if (validIds.length === 0) return new Map();

  const [primaryAms, junctionLinks] = await Promise.all([
    AccountManager.findAll({
      where: { corporateId: validIds },
      order: [["created_at", "ASC"]],
    }),
    CorporateContactPerson.findAll({
      where: { corporateId: validIds },
      order: [["created_at", "ASC"]],
    }),
  ]);

  const contactByCorp = new Map();
  for (const am of primaryAms) {
    if (!contactByCorp.has(am.corporateId)) contactByCorp.set(am.corporateId, am);
  }

  const corpsNeedingFallback = validIds.filter((id) => !contactByCorp.has(id));
  if (corpsNeedingFallback.length > 0 && junctionLinks.length > 0) {
    const linksForFallback = junctionLinks.filter((j) =>
      corpsNeedingFallback.includes(j.corporateId)
    );
    const amIds = [...new Set(linksForFallback.map((j) => j.accountManagerId))];
    const ams = amIds.length
      ? await AccountManager.findAll({ where: { accountManagerId: amIds } })
      : [];
    const amById = new Map(ams.map((am) => [am.accountManagerId, am]));
    for (const link of linksForFallback) {
      if (contactByCorp.has(link.corporateId)) continue;
      const am = amById.get(link.accountManagerId);
      if (am) contactByCorp.set(link.corporateId, am);
    }
  }

  return contactByCorp;
}

// Read-side fallback: for every plain account object whose per-account
// contact info is empty or an import-placeholder, overlay the corporate's
// primary contact person (legacy column or junction-linked).
//
// Mutates the array in place (and returns it) so callers can chain.
async function enrichAccountsWithCorporateContact(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) return accounts;

  const candidates = accounts.filter((acc) => acc && isContactPlaceholderOrEmpty(acc));
  if (candidates.length === 0) return accounts;

  const corporateIds = candidates
    .map((acc) => acc.corporateId)
    .filter((id) => isInt(id));
  if (corporateIds.length === 0) return accounts;

  const contactByCorp = await buildCorporatePrimaryContactMap(corporateIds);
  if (contactByCorp.size === 0) return accounts;

  for (const acc of accounts) {
    if (!isContactPlaceholderOrEmpty(acc)) continue;
    const am = contactByCorp.get(acc.corporateId);
    if (!am) continue;
    acc.contactFirstName = am.firstName || acc.contactFirstName || "";
    acc.contactLastName = am.lastName || acc.contactLastName || "";
    acc.contactEmail = am.email || acc.contactEmail || "";
    if (am.phone) acc.contactPhone = am.phone;
  }
  return accounts;
}

module.exports = {
  getCorporateIdsForAccountManager,
  getCorporateIdsForCustomerUser,
  getAccountManagerForCustomerUser,
  getAccountsForCustomerUser,
  ensureDefaultAccountForCorporate,
  getAccountManagerIdsForCorporate,
  getContactPersonsForCorporate,
  isContactPlaceholderOrEmpty,
  propagateContactPersonToCorporateAccounts,
  buildCorporatePrimaryContactMap,
  enrichAccountsWithCorporateContact,
};
