const Lead = require("../models/Lead");
const { Op } = require("sequelize");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const {
  createForUserIds,
  resolveManagerTeamNotificationUserIds,
} = require("../services/notificationService");

const LEAD_CREATOR_ROLES = new Set(["executive_staff", "supervisor"]);

async function getManagerExecIds(userId) {
  const manager = await Manager.findOne({ where: { userId } });
  if (!manager) return null;
  const execs = await ExecutiveStaff.findAll({
    where: { managerId: manager.managerId },
    attributes: ["executiveId"],
  });
  return execs.map((e) => e.executiveId).filter(Boolean);
}

async function getSupervisorManagedExecutiveIds(user) {
  const exec = await ExecutiveStaff.findOne({
    where: { userId: user.id },
    attributes: ["executiveId", "managerId"],
  });

  if (!exec) {
    const fallback = await getManagerExecIds(user.id);
    return fallback === null ? [] : fallback;
  }

  if (!exec.managerId) {
    return exec.executiveId ? [exec.executiveId] : [];
  }

  const team = await ExecutiveStaff.findAll({
    where: { managerId: exec.managerId },
    attributes: ["executiveId"],
  });
  const ids = team.map((row) => row.executiveId).filter(Boolean);
  if (ids.length) return ids;
  return exec.executiveId ? [exec.executiveId] : [];
}

exports.createLead = async (req, res) => {
  try {
    if (!LEAD_CREATOR_ROLES.has(req.user.role)) {
      return res.status(403).json({
        status: "Failed",
        message: "Only executive or supervisor users can submit leads",
      });
    }

    const payload = req.body || {};
    const required = ["companyName", "contactPerson", "leadSource", "productInterest"];
    const missing = required.filter((field) => !String(payload[field] || "").trim());

    if (missing.length) {
      return res.status(400).json({ status: "Failed", message: "Please complete the required lead fields" });
    }

    const lead = await Lead.create({
      userId: req.user.id,
      companyName: payload.companyName.trim(),
      contactPerson: payload.contactPerson.trim(),
      contactPhone: payload.contactPhone?.trim() || null,
      contactEmail: payload.contactEmail?.trim() || null,
      leadSource: payload.leadSource.trim(),
      estimatedLines: payload.estimatedLines?.trim() || null,
      productInterest: payload.productInterest.trim(),
      priority: payload.priority?.trim() || null,
      expectedCloseDate: payload.expectedCloseDate || null,
      notes: payload.notes?.trim() || null,
      status: payload.status || "pending",
    });

    try {
      const executive = await ExecutiveStaff.findOne({
        where: { userId: req.user.id },
        attributes: ["executiveId", "firstName", "lastName"],
      });

      if (executive?.executiveId) {
        const recipientIds = (await resolveManagerTeamNotificationUserIds(executive.executiveId))
          .filter((id) => id !== req.user.id);

        if (recipientIds.length) {
          const submitterName = `${executive.firstName || ""} ${executive.lastName || ""}`.trim() || "Executive";
          await createForUserIds(recipientIds, {
            type: "lead",
            title: `New lead submitted - ${lead.companyName}`,
            message: `${submitterName} submitted a new lead for ${lead.companyName} (${lead.productInterest}).`,
            priority: "normal",
            metadata: {
              leadId: lead.leadId,
              executiveId: executive.executiveId,
              submittedByUserId: req.user.id,
            },
          });
        }
      }
    } catch (notifyError) {
      console.error("Lead notification error:", notifyError);
    }

    return res.status(201).json({ status: "Success", message: "Lead created", lead });
  } catch (error) {
    console.error("Create lead error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getTeamLeads = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let executiveIds = [];

    if (user.role === "manager") {
      const managerExecIds = await getManagerExecIds(user.id);
      if (managerExecIds === null) {
        return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
      }
      executiveIds = managerExecIds;
    } else {
      executiveIds = await getSupervisorManagedExecutiveIds(user);
    }

    if (!executiveIds.length) {
      return res.status(200).json({ status: "Success", leads: [] });
    }

    const executives = await ExecutiveStaff.findAll({
      where: { executiveId: { [Op.in]: executiveIds } },
      attributes: ["executiveId", "userId", "firstName", "lastName", "email"],
    });

    const scopedUserIds = executives.map((exec) => exec.userId).filter(Boolean);
    if (!scopedUserIds.length) {
      return res.status(200).json({ status: "Success", leads: [] });
    }

    const leads = await Lead.findAll({
      where: { userId: { [Op.in]: scopedUserIds } },
      order: [["createdAt", "DESC"]],
    });

    const executiveByUserId = new Map(
      executives
        .filter((exec) => exec.userId)
        .map((exec) => [
          exec.userId,
          {
            executiveId: exec.executiveId,
            userId: exec.userId,
            firstName: exec.firstName,
            lastName: exec.lastName,
            fullName: `${exec.firstName || ""} ${exec.lastName || ""}`.trim(),
            email: exec.email,
          },
        ])
    );

    const rows = leads.map((lead) => {
      const raw = lead.toJSON();
      return {
        ...raw,
        executive: executiveByUserId.get(raw.userId) || null,
      };
    });

    return res.status(200).json({ status: "Success", leads: rows });
  } catch (error) {
    console.error("Get team leads error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getMyLeads = async (req, res) => {
  try {
    const leads = await Lead.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ status: "Success", leads });
  } catch (error) {
    console.error("Get leads error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
