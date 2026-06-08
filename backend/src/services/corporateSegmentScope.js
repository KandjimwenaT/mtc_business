// Department-based ("Key Accounts" vs "EBU") visibility scoping for corporates.
//
// A corporate has no explicit segment column. Its segment is derived from:
//   1. Corporate.managerId  -> Manager.department
//      (with legacy fallback Person.department where Person.type='manager',
//      because some imports stored Person.id in corporates.manager_id instead
//      of managers.manager_id)
//   2. Corporate.executiveId -> ExecutiveStaff.managerId -> Manager.department
//      (used only when managerId resolution yields no department)
//
// Staff department resolution mirrors the precedent in ticketController.js.
// A requester with no resolvable department is treated as a super-admin and
// bypasses the filter (sees everything). Departmented users see only
// corporates whose resolved department matches theirs; orphan corporates
// (no resolvable segment) are hidden from departmented users.

const { Op } = require("sequelize");
const Manager = require("../models/Manager");
const Person = require("../models/Person");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const { departmentsMatch } = require("./departmentSegment");

async function resolveRequesterDepartment(user) {
  if (!user) return null;

  if (user.role === "manager" || user.role === "supervisor") {
    const mgr = await Manager.findOne({
      where: { userId: user.id },
      attributes: ["department"],
    });
    if (mgr?.department) return mgr.department;
  }

  if (user.role === "admin") {
    const adminPerson = await Person.findOne({
      where: { email: user.email, type: "admin" },
      attributes: ["department", "managerId"],
    });
    if (adminPerson?.department) return adminPerson.department;
    if (adminPerson?.managerId) {
      const managerPerson = await Person.findByPk(adminPerson.managerId, {
        attributes: ["department"],
      });
      if (managerPerson?.department) return managerPerson.department;
    }
  }

  if (user.role === "executive_staff" || user.role === "supervisor") {
    const exec = await ExecutiveStaff.findOne({
      where: { userId: user.id },
      attributes: ["managerId"],
    });
    if (exec?.managerId) {
      const mgr = await Manager.findByPk(exec.managerId, {
        attributes: ["department"],
      });
      if (mgr?.department) return mgr.department;
    }
  }

  // Last-resort lookup: Person record by email (covers edge cases where the
  // role-specific profile is missing but a directory record exists).
  if (user.email) {
    const person = await Person.findOne({
      where: { email: user.email },
      attributes: ["department", "managerId"],
    });
    if (person?.department) return person.department;
    if (person?.managerId) {
      const managerPerson = await Person.findByPk(person.managerId, {
        attributes: ["department"],
      });
      if (managerPerson?.department) return managerPerson.department;
    }
  }

  return null;
}

// Batched per-corporate department resolution. Returns Map<corporateId, dept|null>.
async function buildCorporateDepartmentMap(corporates) {
  const result = new Map();
  if (!Array.isArray(corporates) || corporates.length === 0) return result;

  const managerIds = new Set();
  const executiveIds = new Set();
  for (const corp of corporates) {
    if (corp?.managerId != null) managerIds.add(corp.managerId);
    if (corp?.executiveId != null) executiveIds.add(corp.executiveId);
  }

  const managerProfileMap = new Map();
  if (managerIds.size) {
    const managerProfiles = await Manager.findAll({
      where: { managerId: { [Op.in]: Array.from(managerIds) } },
      attributes: ["managerId", "department"],
    });
    for (const m of managerProfiles) {
      managerProfileMap.set(m.managerId, m.department || null);
    }
  }

  const personManagerMap = new Map();
  if (managerIds.size) {
    const managerPersons = await Person.findAll({
      where: { id: { [Op.in]: Array.from(managerIds) }, type: "manager" },
      attributes: ["id", "department"],
    });
    for (const p of managerPersons) {
      personManagerMap.set(p.id, p.department || null);
    }
  }

  const executiveManagerIdMap = new Map();
  if (executiveIds.size) {
    const executives = await ExecutiveStaff.findAll({
      where: { executiveId: { [Op.in]: Array.from(executiveIds) } },
      attributes: ["executiveId", "managerId"],
    });
    for (const e of executives) {
      executiveManagerIdMap.set(e.executiveId, e.managerId);
    }
  }

  // Backfill manager departments for executive-only corporates.
  const extraManagerIds = new Set();
  for (const corp of corporates) {
    if (corp?.managerId == null && corp?.executiveId != null) {
      const execMgrId = executiveManagerIdMap.get(corp.executiveId);
      if (execMgrId != null && !managerProfileMap.has(execMgrId)) {
        extraManagerIds.add(execMgrId);
      }
    }
  }
  if (extraManagerIds.size) {
    const extraManagers = await Manager.findAll({
      where: { managerId: { [Op.in]: Array.from(extraManagerIds) } },
      attributes: ["managerId", "department"],
    });
    for (const m of extraManagers) {
      managerProfileMap.set(m.managerId, m.department || null);
    }
  }

  for (const corp of corporates) {
    let department = null;

    if (corp?.managerId != null) {
      if (managerProfileMap.has(corp.managerId)) {
        department = managerProfileMap.get(corp.managerId);
      }
      if (!department && personManagerMap.has(corp.managerId)) {
        department = personManagerMap.get(corp.managerId);
      }
    }

    if (!department && corp?.executiveId != null) {
      const execMgrId = executiveManagerIdMap.get(corp.executiveId);
      if (execMgrId != null && managerProfileMap.has(execMgrId)) {
        department = managerProfileMap.get(execMgrId);
      }
    }

    result.set(corp.corporateId, department || null);
  }

  return result;
}

async function filterCorporatesByRequesterDepartment(corporates, requesterDepartment) {
  if (!Array.isArray(corporates) || corporates.length === 0) return corporates || [];
  if (!requesterDepartment) return corporates;

  const departmentMap = await buildCorporateDepartmentMap(corporates);
  return corporates.filter((corp) => {
    const dept = departmentMap.get(corp?.corporateId);
    return departmentsMatch(dept, requesterDepartment);
  });
}

module.exports = {
  resolveRequesterDepartment,
  buildCorporateDepartmentMap,
  filterCorporatesByRequesterDepartment,
};
