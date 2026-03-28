const Complaint = require("../models/Complaint");
const Account = require("../models/Account");
const ExecutiveStaff = require("../models/ExecutiveStaff");

// Customer submits a new complaint
exports.createComplaint = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can submit complaints" });
    }

    const account = await Account.findOne({ where: { contactEmail: user.email } });
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "No account linked to your email" });
    }

    const { type, priority, title, description } = req.body;

    if (!type || !title || !description) {
      return res.status(400).json({ status: "Failed", message: "Type, title and description are required" });
    }

    const allowedTypes = ["billing", "service", "network", "support", "technical", "other"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ status: "Failed", message: `Invalid type. Allowed: ${allowedTypes.join(", ")}` });
    }

    const allowedPriorities = ["high", "medium", "low"];
    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ status: "Failed", message: `Invalid priority. Allowed: ${allowedPriorities.join(", ")}` });
    }

    const complaint = await Complaint.create({
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
      message: "Complaint submitted successfully",
      complaint: complaint.toJSON(),
    });
  } catch (error) {
    console.error("Create complaint error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer fetches their own complaints
exports.getMyComplaints = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can access this endpoint" });
    }

    const account = await Account.findOne({ where: { contactEmail: user.email } });
    if (!account) {
      return res.status(404).json({ status: "Failed", message: "No account linked to your email" });
    }

    const complaints = await Complaint.findAll({
      where: { accountId: account.accountId },
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ status: "Success", complaints });
  } catch (error) {
    console.error("Get my complaints error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive staff fetches complaints assigned to them
exports.getAssignedComplaints = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "executive_staff") {
      return res.status(403).json({ status: "Failed", message: "Only executive staff can access this endpoint" });
    }

    const executive = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!executive) {
      return res.status(404).json({ status: "Failed", message: "Executive staff profile not found" });
    }

    const complaints = await Complaint.findAll({
      where: { executiveId: executive.executiveId },
      order: [["created_at", "DESC"]],
    });

    // Attach account info for each complaint
    const result = await Promise.all(
      complaints.map(async (c) => {
        const account = await Account.findByPk(c.accountId);
        return {
          ...c.toJSON(),
          accountName: account ? account.accountName : null,
          accountNumber: account ? account.accountNumber : null,
        };
      })
    );

    return res.status(200).json({ status: "Success", complaints: result });
  } catch (error) {
    console.error("Get assigned complaints error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive staff updates complaint status
exports.updateComplaintStatus = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "executive_staff" && user.role !== "admin" && user.role !== "manager" && user.role !== "supervisor") {
      return res.status(403).json({ status: "Failed", message: "You do not have permission to update complaints" });
    }

    const { complaintId } = req.params;
    const { status, resolution } = req.body;

    const complaint = await Complaint.findByPk(complaintId);
    if (!complaint) {
      return res.status(404).json({ status: "Failed", message: "Complaint not found" });
    }

    const allowedStatuses = ["pending", "open", "in_progress", "resolved", "closed"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
    }

    if (status) complaint.status = status;
    if (resolution) complaint.resolution = resolution;
    if (status === "resolved") complaint.resolvedAt = new Date();

    await complaint.save();

    return res.status(200).json({
      status: "Success",
      message: "Complaint updated successfully",
      complaint: complaint.toJSON(),
    });
  } catch (error) {
    console.error("Update complaint error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
