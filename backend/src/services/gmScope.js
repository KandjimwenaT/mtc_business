// GM hierarchy scoping: GM → Managers (gm_id) → ExecutiveStaff → corporates/accounts/tickets/visits

const { Op } = require("sequelize");
const GM = require("../models/GM");
const Manager = require("../models/Manager");
const Person = require("../models/Person");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Account = require("../models/Account");
const Corporate = require("../models/Corporate");
const { buildCorporateDepartmentMap } = require("./corporateSegmentScope");

async function resolveGmProfile(user) {
  if (!user || user.role !== "gm") return null;

  let gm = await GM.findOne({ where: { userId: user.id } });
  if (!gm && user.email) {
    gm = await GM.findOne({ where: { email: user.email } });
    // Link orphaned GM rows created before portal access set user_id.
    if (gm && !gm.userId && user.id) {
      await gm.update({ userId: user.id });
    }
  }
  return gm;
}

async function resolveGmPerson(gmProfile) {
  if (!gmProfile?.email) return null;
  return Person.findOne({
    where: { email: gmProfile.email, type: "gm" },
    attributes: ["id", "email"],
  });
}

// All Manager profile rows reporting to this GM (managers.gm_id + persons.gm_id fallback).
async function resolveGmManagerProfiles(gmProfile) {
  if (!gmProfile?.gmId) return [];

  const managerMap = new Map();

  const byGmFk = await Manager.findAll({
    where: { gmId: gmProfile.gmId },
    order: [["first_name", "ASC"]],
  });
  for (const mgr of byGmFk) {
    managerMap.set(mgr.managerId, mgr);
  }

  const gmPerson = await resolveGmPerson(gmProfile);
  if (gmPerson) {
    const linkedPersons = await Person.findAll({
      where: {
        gmId: gmPerson.id,
        type: { [Op.in]: ["manager", "supervisor"] },
      },
      attributes: ["email"],
    });
    const emails = linkedPersons.map((p) => p.email).filter(Boolean);
    if (emails.length) {
      const linkedManagers = await Manager.findAll({
        where: { email: { [Op.in]: emails } },
        order: [["first_name", "ASC"]],
      });
      for (const mgr of linkedManagers) {
        if (!managerMap.has(mgr.managerId)) {
          managerMap.set(mgr.managerId, mgr);
        }
      }
    }
  }

  return Array.from(managerMap.values());
}

async function buildGmManagerIdSet(gmProfile) {
  const managers = await resolveGmManagerProfiles(gmProfile);
  const ids = new Set();
  if (!managers.length) return { managers, managerIds: ids };

  const emails = managers.map((m) => m.email).filter(Boolean);
  const persons = emails.length
    ? await Person.findAll({
        where: {
          email: { [Op.in]: emails },
          type: { [Op.in]: ["manager", "supervisor"] },
        },
        attributes: ["id", "email"],
      })
    : [];
  const personByEmail = new Map(persons.map((p) => [p.email, p.id]));

  for (const mgr of managers) {
    ids.add(mgr.managerId);
    const personId = personByEmail.get(mgr.email);
    if (personId != null) ids.add(personId);
  }

  return { managers, managerIds: ids };
}

async function resolveGmManagerIds(gmProfile) {
  const { managerIds } = await buildGmManagerIdSet(gmProfile);
  return Array.from(managerIds);
}

async function resolveGmExecutiveIds(gmProfile) {
  const { managerIds } = await buildGmManagerIdSet(gmProfile);
  if (!managerIds.size) return [];

  const executives = await ExecutiveStaff.findAll({
    where: { managerId: { [Op.in]: Array.from(managerIds) } },
    attributes: ["executiveId"],
  });
  return executives.map((e) => e.executiveId);
}

async function resolveGmScope(gmProfile) {
  const { managers, managerIds } = await buildGmManagerIdSet(gmProfile);
  const executiveIds = managerIds.size
    ? (
        await ExecutiveStaff.findAll({
          where: { managerId: { [Op.in]: Array.from(managerIds) } },
          attributes: ["executiveId"],
        })
      ).map((e) => e.executiveId)
    : [];
  return { managers, managerIds: Array.from(managerIds), executiveIds };
}

async function resolveManagerDepartmentFromProfile(managerProfile) {
  if (!managerProfile) return null;
  if (managerProfile.department) return managerProfile.department;
  if (!managerProfile.email) return null;
  const person = await Person.findOne({
    where: {
      email: managerProfile.email,
      type: { [Op.in]: ["manager", "supervisor"] },
    },
    attributes: ["department"],
  });
  return person?.department || null;
}

// Corporates assigned to managers under this GM (corporates.manager_id = Manager.managerId).
async function filterCorporatesByGmManagers(allCorporates, gmProfile) {
  if (!Array.isArray(allCorporates) || allCorporates.length === 0) return [];
  if (!gmProfile) return [];

  const { managerIds } = await buildGmManagerIdSet(gmProfile);
  if (!managerIds.size) return [];

  const mgrSet = managerIds;
  const executiveIds = new Set(await resolveGmExecutiveIds(gmProfile));

  const accounts = await Account.findAll({
    where: { managerId: { [Op.in]: Array.from(mgrSet) } },
    attributes: ["corporateId", "executiveId"],
  });
  const corpIdsFromAccounts = new Set();
  for (const acc of accounts) {
    if (acc.corporateId != null) corpIdsFromAccounts.add(acc.corporateId);
    if (acc.executiveId != null) executiveIds.add(acc.executiveId);
  }

  return allCorporates.filter((corp) => {
    if (corp.managerId != null && mgrSet.has(corp.managerId)) return true;
    if (corp.executiveId != null && executiveIds.has(corp.executiveId)) return true;
    if (corpIdsFromAccounts.has(corp.corporateId)) return true;
    return false;
  });
}

async function resolveGmCorporateIds(gmProfile) {
  const plain = (await Corporate.findAll()).map((c) => c.toJSON());
  const scoped = await filterCorporatesByGmManagers(plain, gmProfile);
  return scoped.map((c) => c.corporateId);
}

// Tag each corporate with EBU / Key Accounts for the GM segment toggle.
async function attachGmManagerDepartmentsToCorporates(corporates, gmProfile) {
  if (!Array.isArray(corporates) || !corporates.length || !gmProfile) return corporates;

  const managers = await resolveGmManagerProfiles(gmProfile);
  const deptByManagerKey = new Map();
  for (const mgr of managers) {
    const dept = await resolveManagerDepartmentFromProfile(mgr);
    deptByManagerKey.set(mgr.managerId, dept);
    const person = await Person.findOne({
      where: { email: mgr.email, type: { [Op.in]: ["manager", "supervisor"] } },
      attributes: ["id"],
    });
    if (person?.id) deptByManagerKey.set(person.id, dept);
  }

  const deptMap = await buildCorporateDepartmentMap(corporates);
  for (const corp of corporates) {
    corp.department =
      (corp.managerId != null ? deptByManagerKey.get(corp.managerId) : null) ||
      deptMap.get(corp.corporateId) ||
      null;
  }
  return corporates;
}

async function ticketInGmScope(ticket, managerIds, executiveIds, accountManagerMap) {
  if (!ticket) return false;
  const execSet = executiveIds instanceof Set ? executiveIds : new Set(executiveIds);
  const mgrSet = managerIds instanceof Set ? managerIds : new Set(managerIds);

  if (ticket.executiveId != null && execSet.has(ticket.executiveId)) return true;

  if (ticket.accountId != null) {
    const accountMgrId = accountManagerMap.get(ticket.accountId);
    if (accountMgrId != null && mgrSet.has(accountMgrId)) return true;
  }
  return false;
}

async function filterTicketsByGmScope(tickets, gmProfile) {
  if (!Array.isArray(tickets) || tickets.length === 0) return tickets || [];
  if (!gmProfile) return [];

  const { managerIds: managerIdArr, executiveIds } = await resolveGmScope(gmProfile);
  if (!managerIdArr.length) return [];

  const managerIds = new Set(managerIdArr);
  const execSet = new Set(executiveIds);

  const accountIds = tickets.map((t) => t.accountId).filter((id) => id != null);
  const accountManagerMap = new Map();
  if (accountIds.length) {
    const accounts = await Account.findAll({
      where: { accountId: { [Op.in]: [...new Set(accountIds)] } },
      attributes: ["accountId", "managerId"],
    });
    for (const acc of accounts) {
      accountManagerMap.set(acc.accountId, acc.managerId);
    }
  }

  const results = [];
  for (const ticket of tickets) {
    if (await ticketInGmScope(ticket, managerIds, execSet, accountManagerMap)) {
      results.push(ticket);
    }
  }
  return results;
}

async function buildGmVisitWhereClause(gmProfile) {
  const executiveIds = await resolveGmExecutiveIds(gmProfile);
  if (!executiveIds.length) {
    return { executiveId: { [Op.in]: [-1] } };
  }
  return { executiveId: { [Op.in]: executiveIds } };
}

async function resolveGmScopeForUser(user) {
  const gmProfile = await resolveGmProfile(user);
  if (!gmProfile) return { gmProfile: null, managers: [], managerIds: [], executiveIds: [] };
  const scope = await resolveGmScope(gmProfile);
  return { gmProfile, ...scope };
}

module.exports = {
  resolveGmProfile,
  resolveGmPerson,
  resolveGmManagerProfiles,
  resolveGmManagerIds,
  resolveGmExecutiveIds,
  resolveGmScope,
  resolveGmScopeForUser,
  resolveManagerDepartmentFromProfile,
  filterCorporatesByGmManagers,
  resolveGmCorporateIds,
  attachGmManagerDepartmentsToCorporates,
  filterTicketsByGmScope,
  buildGmVisitWhereClause,
};
