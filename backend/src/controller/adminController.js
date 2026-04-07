const crypto = require("crypto");
const securityService = require("../services/securityService");
const emailService = require("../services/emailService");
const Person = require("../models/Person");
const User = require("../models/User");
const GM = require("../models/GM");
const Manager = require("../models/Manager");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Corporate = require("../models/Corporate");
const AccountManager = require("../models/AccountManager");
const Account = require("../models/Account");
const Contract = require("../models/Contract");
const Service = require("../models/Service");
const { createForUserIds } = require("../services/notificationService");

async function resolveExecutiveUserIdByExecutiveProfileId(executiveProfileId) {
  if (!executiveProfileId) return null;
  const executive = await ExecutiveStaff.findByPk(executiveProfileId);
  if (!executive) return null;
  if (executive.userId) return executive.userId;
  const user = await User.findOne({
    where: { role: "executive_staff", email: executive.email },
  });
  return user ? user.id : null;
}

// ── Create Person (database record, no portal access) ───────────
exports.createPerson = async (req, res) => {
  const { firstName, lastName, email, phone, type, region, department, gmId, managerId, executiveIds, corporateId } = req.body;

  const allowedTypes = ["executive_staff", "supervisor", "manager", "gm", "admin", "customer"];

  if (!firstName || !lastName || !email || !type) {
    return res
      .status(400)
      .json({ status: "Failed", message: "First name, last name, email, and type are required" });
  }

  if (!securityService.validateEmail(email)) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Invalid email format" });
  }

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({
      status: "Failed",
      message: `Invalid type. Allowed: ${allowedTypes.join(", ")}`,
    });
  }

  // Type-specific hierarchy validation
  if (type === "manager" && !gmId) {
    return res.status(400).json({ status: "Failed", message: "GM is required when creating a Manager" });
  }
  if (type === "executive_staff" && !managerId) {
    return res.status(400).json({ status: "Failed", message: "Manager is required when creating an Executive Staff member" });
  }
  if (type === "admin" && !managerId) {
    return res.status(400).json({ status: "Failed", message: "Manager is required when creating an Admin" });
  }
  if (type === "admin" && (!Array.isArray(executiveIds) || executiveIds.length === 0)) {
    return res.status(400).json({ status: "Failed", message: "At least one Executive must be linked when creating an Admin" });
  }

  const normalizedExecutiveIds =
    type === "admin" && Array.isArray(executiveIds)
      ? [...new Set(executiveIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

  if (type === "admin" && normalizedExecutiveIds.length === 0) {
    return res.status(400).json({ status: "Failed", message: "At least one valid Executive must be linked when creating an Admin" });
  }
  if (type === "customer" && !corporateId) {
    return res.status(400).json({ status: "Failed", message: "Corporate is required when creating an Account Manager" });
  }

  try {
    const existing =
      type === "customer"
        ? await AccountManager.findOne({ where: { email } })
        : await Person.findOne({ where: { email } });

    if (existing) {
      return res
        .status(400)
        .json({ status: "Failed", message: "A user/contact with this email already exists" });
    }

    if (type === "admin") {
      const manager = await Person.findByPk(managerId);
      if (!manager || manager.type !== "manager") {
        return res.status(400).json({ status: "Failed", message: "Selected manager is invalid" });
      }

      const linkedExecutives = await Person.findAll({
        where: {
          id: normalizedExecutiveIds,
          type: "executive_staff",
          managerId: managerId,
        },
      });

      if (linkedExecutives.length !== normalizedExecutiveIds.length) {
        return res.status(400).json({
          status: "Failed",
          message: "One or more selected executives are invalid or not linked to the selected manager",
        });
      }
    }

    if (type === "customer") {
      const selectedCorporate = await Corporate.findByPk(corporateId);
      if (!selectedCorporate) {
        return res.status(400).json({ status: "Failed", message: "Selected corporate is invalid" });
      }

      const existingContact = await AccountManager.findOne({
        where: { corporateId: selectedCorporate.corporateId },
      });
      if (existingContact) {
        return res.status(400).json({
          status: "Failed",
          message: "This corporate already has an Account Manager contact person",
        });
      }

      const accountManager = await AccountManager.create({
        firstName,
        lastName,
        email,
        phone: phone || null,
        corporateId: selectedCorporate.corporateId,
        hasPortalAccess: false,
      });

      return res.status(201).json({
        status: "Success",
        message: "User created successfully",
        person: accountManager,
      });
    }

    const person = await Person.create({
      firstName,
      lastName,
      email,
      phone: phone || null,
      type,
      region: type === "admin" ? JSON.stringify(normalizedExecutiveIds) : (region || null),
      department: department || null,
      gmId: type === "manager" ? (gmId || null) : null,
      managerId: (type === "executive_staff" || type === "admin") ? (managerId || null) : null,
    });

    return res.status(201).json({
      status: "Success",
      message: "User created successfully",
      person,
    });
  } catch (error) {
    console.error("Create person error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get corporates without account manager contact persons ────────
exports.getCorporatesWithoutContactPersons = async (req, res) => {
  try {
    const corporates = await Corporate.findAll({ order: [["corporate_name", "ASC"]] });
    const contacts = await AccountManager.findAll({ attributes: ["corporateId"] });

    const takenCorporateIds = new Set(
      contacts
        .map((am) => am.corporateId)
        .filter((id) => Number.isInteger(id))
    );

    const available = corporates.filter((corporate) => !takenCorporateIds.has(corporate.corporateId));
    return res.status(200).json({ status: "Success", corporates: available });
  } catch (error) {
    console.error("Get corporates without contact persons error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── List persons by type ─────────────────────────────────────────
exports.getPersonsByType = async (req, res) => {
  const { type } = req.query;
  const allowedTypes = ["executive_staff", "supervisor", "manager", "gm", "admin", "customer"];

  const where = {};
  if (type) {
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        status: "Failed",
        message: `Invalid type. Allowed: ${allowedTypes.join(", ")}`,
      });
    }
    where.type = type;
  }

  try {
    if (type === "customer") {
      const accountManagers = await AccountManager.findAll({ order: [["created_at", "DESC"]] });
      const corporateIds = accountManagers.map((am) => am.corporateId).filter((id) => Number.isInteger(id));
      const corps = corporateIds.length ? await Corporate.findAll({ where: { corporateId: corporateIds } }) : [];
      const corpMap = Object.fromEntries(corps.map((c) => [c.corporateId, c]));

      const mapped = accountManagers.map((am) => ({
        id: am.accountManagerId,
        firstName: am.firstName,
        lastName: am.lastName,
        email: am.email,
        phone: am.phone,
        type: "customer",
        region: null,
        department: corpMap[am.corporateId]?.corporateName ?? null,
        gmId: null,
        managerId: null,
        corporateId: am.corporateId,
        hasPortalAccess: am.hasPortalAccess,
        created_at: am.createdAt,
      }));

      return res.status(200).json({ status: "Success", persons: mapped });
    }

    const persons = await Person.findAll({ where, order: [["created_at", "DESC"]] });
    return res.status(200).json({ status: "Success", persons });
  } catch (error) {
    console.error("Get persons error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Delete person/contact without portal access ───────────────────
exports.deletePersonWithoutPortalAccess = async (req, res) => {
  const { personId } = req.params;
  const personType = req.query.type;

  if (!personId) {
    return res.status(400).json({ status: "Failed", message: "Person ID is required" });
  }

  try {
    if (personType === "customer") {
      const accountManager = await AccountManager.findByPk(personId);
      if (!accountManager) {
        return res.status(404).json({ status: "Failed", message: "Account Manager not found" });
      }
      if (accountManager.hasPortalAccess) {
        return res.status(400).json({ status: "Failed", message: "Cannot delete a user who has portal access" });
      }

      await accountManager.destroy();
      return res.status(200).json({ status: "Success", message: "User deleted successfully" });
    }

    const person = await Person.findByPk(personId);
    if (!person) {
      return res.status(404).json({ status: "Failed", message: "Person not found" });
    }
    if (person.hasPortalAccess) {
      return res.status(400).json({ status: "Failed", message: "Cannot delete a user who has portal access" });
    }

    // Clean up any unlinked profile records created earlier without access.
    await GM.destroy({ where: { email: person.email, userId: null } });
    await Manager.destroy({ where: { email: person.email, userId: null } });
    await ExecutiveStaff.destroy({ where: { email: person.email, userId: null } });
    await person.destroy();

    return res.status(200).json({ status: "Success", message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete person error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Create Portal Access (login credentials for an existing person) ─
exports.createPortalAccess = async (req, res) => {
  const { personId, personType } = req.body;

  if (!personId) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Person ID is required" });
  }

  try {
    // Customer (Account Manager) records live in a separate table from Person.
    // Resolve explicitly when personType is provided to avoid ID collisions.
    if (personType === "customer") {
      const accountManager = await AccountManager.findByPk(personId);
      if (!accountManager) {
        return res
          .status(404)
          .json({ status: "Failed", message: "Person not found" });
      }

      const existingUser = await User.findOne({ where: { email: accountManager.email } });
      if (accountManager.hasPortalAccess && existingUser) {
        return res.status(400).json({ status: "Failed", message: "This user already has portal access" });
      }

      if (accountManager.hasPortalAccess && !existingUser) {
        await accountManager.update({ hasPortalAccess: false });
      }

      const tempPassword = generateSecurePassword();
      const hashedPassword = await securityService.hashData(tempPassword);

      let userRecord;
      if (existingUser) {
        await existingUser.update({ password: hashedPassword });
        userRecord = existingUser;
      } else {
        userRecord = await User.create({
          firstName: accountManager.firstName,
          lastName: accountManager.lastName,
          email: accountManager.email,
          phone: accountManager.phone,
          password: hashedPassword,
          role: "customer",
        });
      }

      await accountManager.update({ hasPortalAccess: true });

      try {
        await emailService.sendPortalCredentialsEmail(
          accountManager.email,
          accountManager.firstName,
          tempPassword
        );
      } catch (emailErr) {
        console.error("Failed to send credentials email:", emailErr);
      }

      return res.status(201).json({
        status: "Success",
        message: "Portal access created successfully. Credentials sent via email.",
        user: {
          id: userRecord.id,
          firstName: userRecord.firstName,
          lastName: userRecord.lastName,
          email: userRecord.email,
          role: userRecord.role,
          password: tempPassword,
        },
      });
    }

    const person = await Person.findByPk(personId);
    if (!person) {
      // Try Account Manager (customer) portal access
      const accountManager = await AccountManager.findByPk(personId);
      if (!accountManager) {
        return res
          .status(404)
          .json({ status: "Failed", message: "Person not found" });
      }

      const existingUser = await User.findOne({ where: { email: accountManager.email } });
      if (accountManager.hasPortalAccess && existingUser) {
        return res.status(400).json({ status: "Failed", message: "This user already has portal access" });
      }

      if (accountManager.hasPortalAccess && !existingUser) {
        await accountManager.update({ hasPortalAccess: false });
      }

      const tempPassword = generateSecurePassword();
      const hashedPassword = await securityService.hashData(tempPassword);

      let userRecord;
      if (existingUser) {
        await existingUser.update({ password: hashedPassword });
        userRecord = existingUser;
      } else {
        userRecord = await User.create({
          firstName: accountManager.firstName,
          lastName: accountManager.lastName,
          email: accountManager.email,
          phone: accountManager.phone,
          password: hashedPassword,
          role: "customer",
        });
      }

      await accountManager.update({ hasPortalAccess: true });

      try {
        await emailService.sendPortalCredentialsEmail(
          accountManager.email,
          accountManager.firstName,
          tempPassword
        );
      } catch (emailErr) {
        console.error("Failed to send credentials email:", emailErr);
      }

      return res.status(201).json({
        status: "Success",
        message: "Portal access created successfully. Credentials sent via email.",
        user: {
          id: userRecord.id,
          firstName: userRecord.firstName,
          lastName: userRecord.lastName,
          email: userRecord.email,
          role: userRecord.role,
          password: tempPassword,
        },
      });
    }

    const existingUser = await User.findOne({ where: { email: person.email } });

    // Check if truly fully set up (flag + user + profile all present)
    if (person.hasPortalAccess && existingUser) {
      const alreadyHasProfile =
        (person.type === "gm" && (await GM.findOne({ where: { email: person.email } }))) ||
        (person.type === "manager" && (await Manager.findOne({ where: { email: person.email } }))) ||
        (person.type === "executive_staff" && (await ExecutiveStaff.findOne({ where: { email: person.email } })));
      if (alreadyHasProfile) {
        return res
          .status(400)
          .json({ status: "Failed", message: "This user already has portal access" });
      }
      // Profile is missing despite flag being set — fall through to repair
    }

    // Reset orphaned flag (flag true but no user record)
    if (person.hasPortalAccess && !existingUser) {
      await person.update({ hasPortalAccess: false });
    }

    // Generate fresh credentials (also used to reset password on orphaned users)
    const tempPassword = generateSecurePassword();
    const hashedPassword = await securityService.hashData(tempPassword);

    const roleMap = {
      executive_staff: "executive_staff",
      supervisor: "supervisor",
      manager: "manager",
      gm: "gm",
      admin: "admin",
      customer: "customer",
    };

    let userRecord;
    if (existingUser) {
      // Orphaned user — reset its password so we can send it
      await existingUser.update({ password: hashedPassword });
      userRecord = existingUser;
    } else {
      userRecord = await User.create({
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        password: hashedPassword,
        role: roleMap[person.type] || "executive_staff",
      });
    }

    // Resolve the correct FK IDs by looking up the actual profile tables.
    // persons.gmId and persons.managerId store persons.id values, but
    // managers.gm_id and executive_staff.manager_id are FKs to gm.gm_id
    // and managers.manager_id respectively, which only exist after portal access is granted.
    let resolvedGmId = null;
    if (person.gmId) {
      const gmPerson = await Person.findByPk(person.gmId);
      if (gmPerson) {
        const gmUser = await User.findOne({ where: { email: gmPerson.email } });
        if (gmUser) {
          const gmProfile = await GM.findOne({ where: { userId: gmUser.id } });
          resolvedGmId = gmProfile ? gmProfile.gmId : null;
        }
      }
    }

    let resolvedManagerProfileId = null;
    if (person.managerId) {
      const managerPerson = await Person.findByPk(person.managerId);
      if (managerPerson) {
        const managerUser = await User.findOne({ where: { email: managerPerson.email } });
        if (managerUser) {
          const managerProfile = await Manager.findOne({ where: { userId: managerUser.id } });
          resolvedManagerProfileId = managerProfile ? managerProfile.managerId : null;
        }
      }
    }

    // Create profile entry (skip if it already exists)
    if (person.type === "gm") {
      const existing = await GM.findOne({ where: { email: person.email } });
      if (!existing) {
        await GM.create({
          userId: userRecord.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
        });
      }
    } else if (person.type === "manager" || person.type === "supervisor") {
      const existing = await Manager.findOne({ where: { email: person.email } });
      if (!existing) {
        await Manager.create({
          userId: userRecord.id,
          gmId: resolvedGmId,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          department: person.department || null,
        });
      }
    } else if (person.type === "executive_staff") {
      const existing = await ExecutiveStaff.findOne({ where: { email: person.email } });
      if (!existing) {
        await ExecutiveStaff.create({
          userId: userRecord.id,
          managerId: resolvedManagerProfileId,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          region: person.region || null,
        });
      }
    }

    await person.update({ hasPortalAccess: true });

    try {
      await emailService.sendPortalCredentialsEmail(
        person.email,
        person.firstName,
        tempPassword
      );
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Portal temp password for ${person.email}: ${tempPassword}`);
      }
    } catch (emailErr) {
      console.error("Failed to send credentials email:", emailErr);
    }

    return res.status(201).json({
      status: "Success",
      message: "Portal access created successfully. Credentials sent via email.",
      user: {
        id: userRecord.id,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
        email: userRecord.email,
        role: userRecord.role,
        password: tempPassword,
      },
    });
  } catch (error) {
    console.error("Create portal access error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── List portal users ────────────────────────────────────────────
exports.getPortalUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "firstName", "lastName", "email", "phone", "role", "created_at"],
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json({ status: "Success", users });
  } catch (error) {
    console.error("Get portal users error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get GMs (for manager creation dropdown) ──────────────────────
exports.getGMs = async (req, res) => {
  try {
    const gms = await GM.findAll({ order: [["first_name", "ASC"]] });
    return res.status(200).json({ status: "Success", gms });
  } catch (error) {
    console.error("Get GMs error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Managers (for executive creation dropdown) ───────────────
exports.getManagers = async (req, res) => {
  try {
    const managers = await Manager.findAll({ order: [["first_name", "ASC"]] });
    return res.status(200).json({ status: "Success", managers });
  } catch (error) {
    console.error("Get managers error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Executives (for account creation dropdown) ───────────────
exports.getExecutives = async (req, res) => {
  try {
    const executives = await ExecutiveStaff.findAll({ order: [["first_name", "ASC"]] });
    return res.status(200).json({ status: "Success", executives });
  } catch (error) {
    console.error("Get executives error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Promote Executive to Supervisor (manager scope) ───────────────
exports.promoteExecutiveToSupervisor = async (req, res) => {
  const { executivePersonId } = req.params;

  if (!executivePersonId) {
    return res.status(400).json({ status: "Failed", message: "Executive person ID is required" });
  }
  if (!["manager", "supervisor"].includes(req.user?.role)) {
    return res.status(403).json({ status: "Failed", message: "Only managers can promote executives" });
  }

  try {
    const managerProfile = await Manager.findOne({ where: { userId: req.user.id } });
    if (!managerProfile) {
      return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
    }
    const managerPerson = await Person.findOne({
      where: { email: managerProfile.email },
    });
    const managerPersonId = managerPerson ? managerPerson.id : null;

    const executivePerson = await Person.findByPk(executivePersonId);
    if (!executivePerson || executivePerson.type !== "executive_staff") {
      return res.status(404).json({ status: "Failed", message: "Executive person not found" });
    }

    const belongsToManager =
      executivePerson.managerId === managerProfile.managerId ||
      (managerPersonId !== null && executivePerson.managerId === managerPersonId);
    if (!belongsToManager) {
      return res.status(403).json({ status: "Failed", message: "You can only promote executives under your team" });
    }

    const user = await User.findOne({ where: { email: executivePerson.email } });
    if (!user) {
      return res.status(400).json({ status: "Failed", message: "Executive has no portal user to promote" });
    }

    await user.update({ role: "supervisor" });
    await executivePerson.update({ type: "supervisor" });

    // Keep/create manager profile so supervisor can use manager-level pages/flows.
    let supervisorManagerProfile = await Manager.findOne({ where: { email: executivePerson.email } });
    if (!supervisorManagerProfile) {
      supervisorManagerProfile = await Manager.create({
        userId: user.id,
        gmId: managerProfile.gmId || null,
        firstName: executivePerson.firstName,
        lastName: executivePerson.lastName,
        email: executivePerson.email,
        phone: executivePerson.phone || null,
        department: managerProfile.department || null,
      });
    } else if (!supervisorManagerProfile.userId) {
      await supervisorManagerProfile.update({ userId: user.id });
    }

    await createForUserIds([user.id, req.user.id], {
      type: "role",
      title: "Role Upgrade Applied",
      message: `${executivePerson.firstName} ${executivePerson.lastName} has been promoted to Supervisor.`,
      priority: "normal",
      metadata: {
        personId: executivePerson.id,
        email: executivePerson.email,
        role: "supervisor",
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Executive promoted to supervisor successfully",
      person: executivePerson,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Promote executive error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Demote Supervisor back to Executive (manager scope) ───────────
exports.demoteSupervisorToExecutive = async (req, res) => {
  const { supervisorPersonId } = req.params;

  if (!supervisorPersonId) {
    return res.status(400).json({ status: "Failed", message: "Supervisor person ID is required" });
  }
  if (!["manager", "supervisor"].includes(req.user?.role)) {
    return res.status(403).json({ status: "Failed", message: "Only managers can demote supervisors" });
  }

  try {
    const managerProfile = await Manager.findOne({ where: { userId: req.user.id } });
    if (!managerProfile) {
      return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
    }
    const managerPerson = await Person.findOne({ where: { email: managerProfile.email } });
    const managerPersonId = managerPerson ? managerPerson.id : null;

    const supervisorPerson = await Person.findByPk(supervisorPersonId);
    if (!supervisorPerson || supervisorPerson.type !== "supervisor") {
      return res.status(404).json({ status: "Failed", message: "Supervisor person not found" });
    }

    const belongsToManager =
      supervisorPerson.managerId === managerProfile.managerId ||
      (managerPersonId !== null && supervisorPerson.managerId === managerPersonId);
    if (!belongsToManager) {
      return res.status(403).json({ status: "Failed", message: "You can only demote supervisors under your team" });
    }

    const user = await User.findOne({ where: { email: supervisorPerson.email } });
    if (!user) {
      return res.status(400).json({ status: "Failed", message: "Supervisor has no portal user to demote" });
    }

    await user.update({ role: "executive_staff" });
    await supervisorPerson.update({ type: "executive_staff" });

    // Keep manager profile data for historical/audit continuity, but detach portal login.
    await Manager.update({ userId: null }, { where: { email: supervisorPerson.email, userId: user.id } });

    let executiveProfile = await ExecutiveStaff.findOne({ where: { email: supervisorPerson.email } });
    if (!executiveProfile) {
      executiveProfile = await ExecutiveStaff.create({
        userId: user.id,
        managerId: managerProfile.managerId,
        firstName: supervisorPerson.firstName,
        lastName: supervisorPerson.lastName,
        email: supervisorPerson.email,
        phone: supervisorPerson.phone || null,
        region: supervisorPerson.region || null,
      });
    } else if (!executiveProfile.userId) {
      await executiveProfile.update({ userId: user.id, managerId: managerProfile.managerId });
    }

    await createForUserIds([user.id, req.user.id], {
      type: "role",
      title: "Role Downgrade Applied",
      message: `${supervisorPerson.firstName} ${supervisorPerson.lastName} has been moved back to Executive Staff.`,
      priority: "normal",
      metadata: {
        personId: supervisorPerson.id,
        email: supervisorPerson.email,
        role: "executive_staff",
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Supervisor demoted to executive successfully",
      person: supervisorPerson,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("Demote supervisor error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Create Corporate ──────────────────────────────────────────────
exports.createCorporate = async (req, res) => {
  const { corporateNumber, corporateName, corporateType, businessEmail, industry, managerId, isActive } = req.body;

  if (!corporateNumber || !corporateName || !corporateType || !businessEmail || !managerId) {
    return res.status(400).json({
      status: "Failed",
      message: "Corporate number, name, type, business email, and assigned manager are required",
    });
  }

  if (!securityService.validateEmail(businessEmail)) {
    return res.status(400).json({ status: "Failed", message: "Invalid business email format" });
  }

  try {
    const existingByNumber = await Corporate.findOne({ where: { corporateNumber } });
    if (existingByNumber) {
      return res.status(400).json({ status: "Failed", message: "A corporate with this corporate number already exists" });
    }

    const existingByEmail = await Corporate.findOne({ where: { businessEmail } });
    if (existingByEmail) {
      return res.status(400).json({ status: "Failed", message: "A corporate with this business email already exists" });
    }

    const corporate = await Corporate.create({
      corporateNumber,
      corporateName,
      corporateType,
      businessEmail,
      industry: industry || null,
      managerId: managerId || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({ status: "Success", message: "Corporate created successfully", corporate });
  } catch (error) {
    console.error("Create corporate error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Corporates ────────────────────────────────────────────────
exports.getCorporates = async (req, res) => {
  const { managerId } = req.query;
  const where = {};
  if (managerId) where.managerId = managerId;

  try {
    const corporates = await Corporate.findAll({ where, order: [["created_at", "DESC"]] });
    const plain = corporates.map((c) => c.toJSON());
    const execIds = [...new Set(plain.filter((c) => c.executiveId).map((c) => c.executiveId))];
    if (execIds.length) {
      const execs = await ExecutiveStaff.findAll({ where: { executiveId: execIds } });
      const execMap = Object.fromEntries(execs.map((e) => [e.executiveId, e]));
      for (const corp of plain) {
        const ex = execMap[corp.executiveId];
        if (ex) {
          corp.executiveFirstName = ex.firstName;
          corp.executiveLastName = ex.lastName;
        }
      }
    }
    return res.status(200).json({ status: "Success", corporates: plain });
  } catch (error) {
    console.error("Get corporates error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Submit Corporate Approval (admin finalizes) ────────────────
// Admin can request approval only after:
// - the corporate has at least one account
// - a contact person (Account Manager) is linked to the corporate
exports.submitCorporateApproval = async (req, res) => {
  const { corporateId } = req.params;

  if (!corporateId) {
    return res.status(400).json({ status: "Failed", message: "Corporate ID is required" });
  }

  if (req.user?.role !== "admin") {
    return res.status(403).json({ status: "Failed", message: "Only admins can submit corporates for approval" });
  }

  try {
    const corporate = await Corporate.findByPk(corporateId);
    if (!corporate) {
      return res.status(404).json({ status: "Failed", message: "Corporate not found" });
    }

    if (corporate.approvalStatus !== "pending") {
      return res.status(400).json({
        status: "Failed",
        message: `Corporate cannot be submitted for approval when status is '${corporate.approvalStatus}'`,
      });
    }

    const accountCount = await Account.count({ where: { corporateId: corporate.corporateId } });
    if (accountCount < 1) {
      return res.status(400).json({
        status: "Failed",
        message: "Add at least one account before submitting for approval",
      });
    }

    const hasContact = await AccountManager.findOne({ where: { corporateId: corporate.corporateId } });
    if (!hasContact) {
      return res.status(400).json({
        status: "Failed",
        message: "Add a contact person (Account Manager) before submitting for approval",
      });
    }

    // Move the corporate from "pending setup" to "waiting for manager approval"
    await corporate.update({ approvalStatus: "waiting_approval" });

    return res.status(200).json({
      status: "Success",
      message: "Corporate submitted for approval (waiting manager approval)",
      corporate,
    });
  } catch (error) {
    console.error("Submit corporate approval error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Approve Corporate (assigned manager final approval) ───────────
exports.approveCorporate = async (req, res) => {
  const { corporateId } = req.params;
  const { executiveId } = req.body;

  if (!corporateId) {
    return res.status(400).json({ status: "Failed", message: "Corporate ID is required" });
  }

  if (!["manager", "supervisor"].includes(req.user?.role)) {
    return res.status(403).json({ status: "Failed", message: "Only managers can approve corporates" });
  }
  if (!executiveId) {
    return res.status(400).json({ status: "Failed", message: "Executive ID is required" });
  }

  try {
    const managerProfile = await Manager.findOne({ where: { userId: req.user.id } });
    if (!managerProfile) {
      return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
    }

    const corporate = await Corporate.findByPk(corporateId);
    if (!corporate) {
      return res.status(404).json({ status: "Failed", message: "Corporate not found" });
    }

    // Compatibility: corporate.manager_id may store either:
    // 1) managers.manager_id (current profile table id), or
    // 2) persons.id for a manager (legacy/person-driven flows)
    const managerPerson = await Person.findOne({
      where: { email: managerProfile.email, type: "manager" },
    });
    const managerPersonId = managerPerson ? managerPerson.id : null;
    const isAssignedManager =
      corporate.managerId === managerProfile.managerId ||
      (managerPersonId !== null && corporate.managerId === managerPersonId);

    if (!isAssignedManager) {
      return res.status(403).json({ status: "Failed", message: "You are not assigned to this corporate" });
    }

    if (corporate.approvalStatus !== "waiting_approval") {
      return res.status(400).json({
        status: "Failed",
        message: `Corporate cannot be approved when status is '${corporate.approvalStatus}'`,
      });
    }

    // Verify executive exists in the Person table
    const executive = await Person.findByPk(executiveId);
    if (!executive || !["executive_staff", "supervisor"].includes(executive.type)) {
      return res.status(404).json({ status: "Failed", message: "Executive not found" });
    }

    // Resolve ExecutiveStaff FK target used by accounts/corporates
    const execStaff = await ExecutiveStaff.findOne({ where: { email: executive.email } });
    if (!execStaff) {
      return res.status(400).json({
        status: "Failed",
        message: "This executive does not have portal access yet. Please grant portal access first.",
      });
    }

    const childAccounts = await Account.findAll({ where: { corporateId: corporate.corporateId } });
    if (childAccounts.length === 0) {
      return res.status(400).json({ status: "Failed", message: "Corporate has no accounts to approve" });
    }

    // Approve each child account under the selected executive.
    // Credential provisioning is no longer part of this flow.
    for (const account of childAccounts) {
      await account.update({
        executiveId: execStaff.executiveId,
        approvalStatus: "approved",
      });
    }

    await corporate.update({
      executiveId: execStaff.executiveId,
      approvalStatus: "approved",
    });
    return res.status(200).json({
      status: "Success",
      message: "Corporate approved successfully",
      corporate,
    });
  } catch (error) {
    console.error("Approve corporate error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Reassign Corporate Executive (manager scope) ──────────────────
exports.reassignCorporateExecutive = async (req, res) => {
  const { corporateId } = req.params;
  const { executiveId } = req.body;

  if (!corporateId) {
    return res.status(400).json({ status: "Failed", message: "Corporate ID is required" });
  }
  if (!executiveId) {
    return res.status(400).json({ status: "Failed", message: "Executive ID is required" });
  }
  if (!["manager", "supervisor"].includes(req.user?.role)) {
    return res.status(403).json({ status: "Failed", message: "Only managers can reassign corporate executives" });
  }

  try {
    const managerProfile = await Manager.findOne({ where: { userId: req.user.id } });
    if (!managerProfile) {
      return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
    }

    const managerPerson = await Person.findOne({
      where: { email: managerProfile.email, type: "manager" },
    });
    const managerPersonId = managerPerson ? managerPerson.id : null;

    const corporate = await Corporate.findByPk(corporateId);
    if (!corporate) {
      return res.status(404).json({ status: "Failed", message: "Corporate not found" });
    }

    const isAssignedManager =
      corporate.managerId === managerProfile.managerId ||
      (managerPersonId !== null && corporate.managerId === managerPersonId);
    if (!isAssignedManager) {
      return res.status(403).json({ status: "Failed", message: "You are not assigned to this corporate" });
    }

    const executivePerson = await Person.findByPk(executiveId);
    if (!executivePerson || !["executive_staff", "supervisor"].includes(executivePerson.type)) {
      return res.status(404).json({ status: "Failed", message: "Executive not found" });
    }

    // Ensure the executive belongs to this manager (supports person/profile id mapping)
    const managerMatch =
      executivePerson.managerId === managerProfile.managerId ||
      (managerPersonId !== null && executivePerson.managerId === managerPersonId);
    if (!managerMatch) {
      return res.status(403).json({ status: "Failed", message: "You can only assign executives under your team" });
    }

    const execStaff = await ExecutiveStaff.findOne({ where: { email: executivePerson.email } });
    if (!execStaff) {
      return res.status(400).json({
        status: "Failed",
        message: "This executive does not have portal access yet. Please grant portal access first.",
      });
    }

    const previousExecutiveProfileId = corporate.executiveId || null;

    // Corporate-level assignment
    await corporate.update({ executiveId: execStaff.executiveId });

    // Keep child accounts aligned to corporate assignment
    await Account.update(
      { executiveId: execStaff.executiveId },
      { where: { corporateId: corporate.corporateId } }
    );

    const previousExecutiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(previousExecutiveProfileId);
    const newExecutiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(execStaff.executiveId);

    if (previousExecutiveUserId && previousExecutiveProfileId !== execStaff.executiveId) {
      await createForUserIds([previousExecutiveUserId], {
        type: "assignment",
        title: `Account Reassigned - ${corporate.corporateName}`,
        message: `${corporate.corporateName} has been reassigned to another executive and is no longer under your portfolio.`,
        priority: "normal",
        metadata: {
          corporateId: corporate.corporateId,
          corporateName: corporate.corporateName,
          kind: "executive_reassigned_from",
        },
      });
    }

    if (newExecutiveUserId) {
      await createForUserIds([newExecutiveUserId], {
        type: "assignment",
        title: `New Account Assignment - ${corporate.corporateName}`,
        message: `You are now assigned to manage ${corporate.corporateName}.`,
        priority: "normal",
        metadata: {
          corporateId: corporate.corporateId,
          corporateName: corporate.corporateName,
          kind: "executive_reassigned_to",
        },
      });
    }

    return res.status(200).json({
      status: "Success",
      message: "Corporate executive reassigned successfully",
      corporate,
    });
  } catch (error) {
    console.error("Reassign corporate executive error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Create Account ───────────────────────────────────────────────
exports.createAccount = async (req, res) => {
  const {
    parentAccountId, corporateId, accountNumber, accountName, accountType, executiveId, managerId,
    contactFirstName, contactLastName, contactEmail, contactPhone,
    industry, isActive,
  } = req.body;

  if (!accountNumber || !accountName || !accountType || !contactFirstName || !contactLastName || !contactEmail) {
    return res.status(400).json({
      status: "Failed",
      message: "Account number, name, type, and primary contact details are required",
    });
  }

  if (!securityService.validateEmail(contactEmail)) {
    return res.status(400).json({ status: "Failed", message: "Invalid contact email format" });
  }

  try {
    if (corporateId) {
      const corporate = await Corporate.findByPk(corporateId);
      if (!corporate) {
        return res.status(404).json({ status: "Failed", message: "Corporate not found" });
      }
    }

    const existing = await Account.findOne({ where: { accountNumber } });
    if (existing) {
      return res.status(400).json({ status: "Failed", message: "An account with this account number already exists" });
    }

    const account = await Account.create({
      parentAccountId: parentAccountId || null,
      corporateId: corporateId || null,
      accountNumber,
      accountName,
      accountType,
      executiveId: executiveId || null,
      managerId: managerId || null,
      contactFirstName,
      contactLastName,
      contactEmail,
      contactPhone: contactPhone || null,
      industry: industry || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({ status: "Success", message: "Account created successfully", account });
  } catch (error) {
    console.error("Create account error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Accounts ─────────────────────────────────────────────────
exports.getAccounts = async (req, res) => {
  const { executiveId, managerId, corporateId } = req.query;
  const where = {};
  if (executiveId) where.executiveId = executiveId;
  if (managerId) where.managerId = managerId;
  if (corporateId) where.corporateId = corporateId;

  try {
    const accounts = await Account.findAll({ where, order: [["created_at", "DESC"]] });

    // Attach executive name to each account that has one assigned
    const plain = accounts.map(a => a.toJSON());
    const execIds = [...new Set(plain.filter(a => a.executiveId).map(a => a.executiveId))];
    if (execIds.length) {
      const execs = await ExecutiveStaff.findAll({ where: { executiveId: execIds } });
      const execMap = Object.fromEntries(execs.map(e => [e.executiveId, e]));
      for (const acc of plain) {
        const ex = execMap[acc.executiveId];
        if (ex) {
          acc.executiveFirstName = ex.firstName;
          acc.executiveLastName = ex.lastName;
        }
      }
    }

    return res.status(200).json({ status: "Success", accounts: plain });
  } catch (error) {
    console.error("Get accounts error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Create Contract (linked to an account) ───────────────────────
exports.createContract = async (req, res) => {
  const { accountId } = req.params;
  const {
    serviceId, contractType, contractStartDate, contractEndDate,
    contractEffectiveDate, srNumber, srCreatedDate, srSubmittedDate,
    srAcceptedDate, usageLimit, entitlement, notes,
  } = req.body;

  if (!contractType) {
    return res.status(400).json({ status: "Failed", message: "Contract type is required" });
  }

  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "Account not found" });
    }

    const contract = await Contract.create({
      accountId: parseInt(accountId, 10),
      serviceId: serviceId || null,
      contractType,
      contractStartDate: contractStartDate || null,
      contractEndDate: contractEndDate || null,
      contractEffectiveDate: contractEffectiveDate || null,
      srNumber: srNumber || null,
      srCreatedDate: srCreatedDate || null,
      srSubmittedDate: srSubmittedDate || null,
      srAcceptedDate: srAcceptedDate || null,
      usageLimit: usageLimit || null,
      entitlement: entitlement || null,
      notes: notes || null,
    });

    return res.status(201).json({ status: "Success", message: "Contract created successfully", contract });
  } catch (error) {
    console.error("Create contract error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Create Service (linked to account) ──────────────────────────
exports.createService = async (req, res) => {
  const { accountId } = req.params;
  const { msisdn, serviceType, status } = req.body;

  if (!serviceType) {
    return res.status(400).json({ status: "Failed", message: "Service type is required" });
  }

  const allowedStatuses = ["active", "suspended", "inactive"];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
  }

  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "Account not found" });
    }

    const service = await Service.create({
      accountId: parseInt(accountId, 10),
      msisdn: msisdn || null,
      serviceType,
      status: status || "active",
    });

    return res.status(201).json({ status: "Success", message: "Service created successfully", service });
  } catch (error) {
    console.error("Create service error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Update Service Status (linked to account) ────────────────────
exports.updateServiceStatus = async (req, res) => {
  const { accountId, serviceId } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["active", "suspended", "inactive"];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
  }

  try {
    const service = await Service.findOne({
      where: {
        serviceId: parseInt(serviceId, 10),
        accountId: parseInt(accountId, 10),
      },
    });

    if (!service) {
      return res.status(404).json({ status: "Failed", message: "Service line not found for this account" });
    }

    await service.update({ status });
    return res.status(200).json({ status: "Success", message: "Service status updated successfully", service });
  } catch (error) {
    console.error("Update service status error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Delete Service (linked to account) ───────────────────────────
exports.deleteService = async (req, res) => {
  const { accountId, serviceId } = req.params;

  try {
    const service = await Service.findOne({
      where: {
        serviceId: parseInt(serviceId, 10),
        accountId: parseInt(accountId, 10),
      },
    });

    if (!service) {
      return res.status(404).json({ status: "Failed", message: "Service line not found for this account" });
    }

    await service.destroy();
    return res.status(200).json({ status: "Success", message: "Service line deleted successfully" });
  } catch (error) {
    console.error("Delete service error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Contracts for an Account ──────────────────────────────────
exports.getAccountContracts = async (req, res) => {
  const { accountId } = req.params;
  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "Account not found" });
    }
    const contracts = await Contract.findAll({
      where: { accountId: parseInt(accountId, 10) },
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json({ status: "Success", contracts });
  } catch (error) {
    console.error("Get account contracts error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Services for an Account ──────────────────────────────────
exports.getAccountServices = async (req, res) => {
  const { accountId } = req.params;

  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "Account not found" });
    }

    const services = await Service.findAll({
      where: { accountId: parseInt(accountId, 10) },
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ status: "Success", services });
  } catch (error) {
    console.error("Get account services error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Approve Account (assign executive + create customer login) ───
exports.approveAccount = async (req, res) => {
  const { accountId } = req.params;
  const { executiveId } = req.body;

  if (!executiveId) {
    return res.status(400).json({ status: "Failed", message: "Executive ID is required for approval" });
  }

  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "Account not found" });
    }

    if (account.approvalStatus === "approved") {
      return res.status(400).json({ status: "Failed", message: "Account is already approved" });
    }

    // Verify executive exists in the Person table
    const executive = await Person.findByPk(executiveId);
    if (!executive || !["executive_staff", "supervisor"].includes(executive.type)) {
      return res.status(404).json({ status: "Failed", message: "Executive not found" });
    }

    // Resolve the ExecutiveStaff profile record (FK target for accounts.executive_id)
    const execStaff = await ExecutiveStaff.findOne({ where: { email: executive.email } });
    if (!execStaff) {
      return res.status(400).json({
        status: "Failed",
        message: "This executive does not have portal access yet. Please grant portal access first.",
      });
    }

    // Create customer portal user for the account contact
    let customerUser = await User.findOne({ where: { email: account.contactEmail } });
    const tempPassword = generateSecurePassword();
    const hashedPassword = await securityService.hashData(tempPassword);

    if (customerUser) {
      // User already exists — update password so we can send fresh credentials
      await customerUser.update({ password: hashedPassword });
    } else {
      customerUser = await User.create({
        firstName: account.contactFirstName,
        lastName: account.contactLastName,
        email: account.contactEmail,
        phone: account.contactPhone,
        password: hashedPassword,
        role: "customer",
      });
    }

    // Update account: assign executive + set approved
    await account.update({
      executiveId: execStaff.executiveId,
      approvalStatus: "approved",
    });

    // Send credentials email
    try {
      await emailService.sendPortalCredentialsEmail(
        account.contactEmail,
        account.contactFirstName,
        tempPassword
      );
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Portal temp password for ${account.contactEmail}: ${tempPassword}`);
      }
    } catch (emailErr) {
      console.error("Failed to send customer credentials email:", emailErr);
    }

    const reloaded = (await account.reload()).toJSON();
    reloaded.executiveFirstName = execStaff.firstName;
    reloaded.executiveLastName = execStaff.lastName;

    return res.status(200).json({
      status: "Success",
      message: "Account approved. Customer credentials sent via email.",
      account: reloaded,
    });
  } catch (error) {
    console.error("Approve account error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Revoke Portal Access (delete user record, preserve person + profile) ─
exports.revokePortalAccess = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ status: "Failed", message: "User ID is required" });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ status: "Failed", message: "User not found" });
    }

    // Nullify user_id FK in all profile tables so the profiles are preserved
    await GM.update({ userId: null }, { where: { userId } });
    await Manager.update({ userId: null }, { where: { userId } });
    await ExecutiveStaff.update({ userId: null }, { where: { userId } });

    // Reset portal access flag on the correct profile record
    if (user.role === "customer") {
      await AccountManager.update({ hasPortalAccess: false }, { where: { email: user.email } });
    } else {
      const person = await Person.findOne({ where: { email: user.email } });
      if (person) {
        await person.update({ hasPortalAccess: false });
      }
    }

    // Delete the user login record
    await user.destroy();

    return res.status(200).json({ status: "Success", message: "Portal access revoked. User login removed; person and profile records retained." });
  } catch (error) {
    console.error("Revoke portal access error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Helper: generate a readable but secure temporary password ────
function generateSecurePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";

  const pick = (chars) => chars[crypto.randomInt(chars.length)];

  // Guarantee at least one from each class
  const mandatory = [pick(upper), pick(lower), pick(digits), pick(special)];

  const all = upper + lower + digits + special;
  const rest = Array.from({ length: 8 }, () => pick(all));

  // Shuffle
  const arr = [...mandatory, ...rest];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.join("");
}
