const { resolveRequesterDepartment } = require("../services/corporateSegmentScope");
const slaService = require("../services/slaService");

const WRITE_ROLES = new Set(["manager", "admin"]);
const READ_ROLES = new Set(["manager", "admin", "supervisor", "gm"]);

exports.listSlaConfigs = async (req, res) => {
  try {
    if (!READ_ROLES.has(req.user?.role)) {
      return res.status(403).json({
        status: "Failed",
        message: "Access denied. Manager, supervisor, GM, or admin role required.",
      });
    }

    const department = await resolveRequesterDepartment(req.user);
    const result = await slaService.listPoliciesForDepartment(department);
    return res.status(200).json({
      status: "Success",
      department: result.department,
      canEdit: WRITE_ROLES.has(req.user.role) && Boolean(result.department),
      catalog: slaService.ticketTypeCatalog(),
      configs: result.configs,
    });
  } catch (error) {
    console.error("List SLA configs error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.saveSlaConfigs = async (req, res) => {
  try {
    if (!WRITE_ROLES.has(req.user?.role)) {
      return res.status(403).json({
        status: "Failed",
        message: "Only managers and admins can update SLA configuration.",
      });
    }

    const department = await resolveRequesterDepartment(req.user);
    const result = await slaService.savePoliciesForDepartment(
      department,
      req.body?.configs,
      req.user.id
    );
    return res.status(200).json({
      status: "Success",
      message: "SLA configuration saved",
      department: result.department,
      canEdit: true,
      catalog: slaService.ticketTypeCatalog(),
      configs: result.configs,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ status: "Failed", message: error.message });
    }
    console.error("Save SLA configs error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
