const AccountRequest = require("../models/AccountRequest");
const Account = require("../models/Account");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const AccountManager = require("../models/AccountManager");

// Customer submits a new account request
exports.createRequest = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can submit requests" });
    }

    // Primary lookup: contactEmail matches the logged-in customer's email.
    // Fallback: Account Manager maps to corporateId.
    let account = await Account.findOne({ where: { contactEmail: user.email } });
    if (!account) {
      const accountManager = await AccountManager.findOne({ where: { email: user.email } });
      if (accountManager) {
        account = await Account.findOne({
          where: { corporateId: accountManager.corporateId },
          order: [["created_at", "DESC"]],
        });
      }
    }
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "No account linked to your access" });
    }

    const { type, priority, title, description } = req.body;

    if (!type || !title || !description) {
      return res.status(400).json({ status: "Failed", message: "Type, title and description are required" });
    }

    const allowedTypes = ["new_line", "plan_change", "line_suspension", "line_activation", "plan_upgrade", "number_change", "other"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ status: "Failed", message: `Invalid type. Allowed: ${allowedTypes.join(", ")}` });
    }

    const allowedPriorities = ["high", "medium", "low"];
    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ status: "Failed", message: `Invalid priority. Allowed: ${allowedPriorities.join(", ")}` });
    }

    const accountRequest = await AccountRequest.create({
      accountId: account.accountId,
      executiveId: account.executiveId || null,
      type,
      priority: priority || "medium",
      title,
      description,
      status: "pending",
      submittedBy: `${account.contactFirstName} ${account.contactLastName}`,
    });

    return res.status(201).json({
      status: "Success",
      message: "Request submitted successfully",
      request: accountRequest.toJSON(),
    });
  } catch (error) {
    console.error("Create account request error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer fetches their own requests
exports.getMyRequests = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can access this endpoint" });
    }

    let account = await Account.findOne({ where: { contactEmail: user.email } });
    if (!account) {
      const accountManager = await AccountManager.findOne({ where: { email: user.email } });
      if (accountManager) {
        account = await Account.findOne({
          where: { corporateId: accountManager.corporateId },
          order: [["created_at", "DESC"]],
        });
      }
    }
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "No account linked to your access" });
    }

    const requests = await AccountRequest.findAll({
      where: { accountId: account.accountId },
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ status: "Success", requests });
  } catch (error) {
    console.error("Get my requests error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive staff fetches requests assigned to them
exports.getAssignedRequests = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "executive_staff") {
      return res.status(403).json({ status: "Failed", message: "Only executive staff can access this endpoint" });
    }

    const executive = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!executive) {
      return res.status(404).json({ status: "Failed", message: "Executive staff profile not found" });
    }

    const requests = await AccountRequest.findAll({
      where: { executiveId: executive.executiveId },
      order: [["created_at", "DESC"]],
    });

    const result = await Promise.all(
      requests.map(async (r) => {
        const account = await Account.findByPk(r.accountId);
        return {
          ...r.toJSON(),
          accountName: account ? account.accountName : null,
          accountNumber: account ? account.accountNumber : null,
        };
      })
    );

    return res.status(200).json({ status: "Success", requests: result });
  } catch (error) {
    console.error("Get assigned requests error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Staff updates request status
exports.updateRequestStatus = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "executive_staff" && user.role !== "admin" && user.role !== "manager" && user.role !== "supervisor") {
      return res.status(403).json({ status: "Failed", message: "You do not have permission to update requests" });
    }

    const { requestId } = req.params;
    const { status, notes } = req.body;

    const accountRequest = await AccountRequest.findByPk(requestId);
    if (!accountRequest) {
      return res.status(404).json({ status: "Failed", message: "Request not found" });
    }

    const allowedStatuses = ["pending", "approved", "rejected", "in_progress", "completed"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
    }

    if (status) accountRequest.status = status;
    if (notes) accountRequest.notes = notes;

    // Track who processed it and when
    if (status && status !== "pending") {
      accountRequest.processedBy = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
      accountRequest.processedAt = new Date();
    }

    await accountRequest.save();

    return res.status(200).json({
      status: "Success",
      message: "Request updated successfully",
      request: accountRequest.toJSON(),
    });
  } catch (error) {
    console.error("Update request error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
