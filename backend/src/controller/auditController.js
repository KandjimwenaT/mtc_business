const { Op } = require("sequelize");
const AuditLog = require("../models/AuditLog");
const { resolveRequesterDepartment } = require("../services/corporateSegmentScope");
const { normalizeDepartmentSegment } = require("../services/departmentSegment");
const { VIEW_ROLES } = require("../services/auditService");

exports.listAuditLogs = async (req, res) => {
  try {
    if (!VIEW_ROLES.has(req.user?.role)) {
      return res.status(403).json({
        status: "Failed",
        message: "Access denied. Admin, manager, or supervisor role required.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const search = String(req.query.search || "").trim();
    const actionType = String(req.query.type || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const where = {};
    const requesterDepartment = await resolveRequesterDepartment(req.user);
    const segment = normalizeDepartmentSegment(requesterDepartment);
    if (segment) {
      where.department = segment;
    }

    if (actionType) {
      where.actionType = actionType;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) {
        const end = new Date(to);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          where.createdAt[Op.lte] = end;
        }
      }
    }

    if (search) {
      where[Op.or] = [
        { actorName: { [Op.like]: `%${search}%` } },
        { actorEmail: { [Op.like]: `%${search}%` } },
        { message: { [Op.like]: `%${search}%` } },
        { actionType: { [Op.like]: `%${search}%` } },
        { entityId: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return res.status(200).json({
      status: "Success",
      logs: rows,
      pagination: {
        page,
        pageSize,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / pageSize)),
      },
    });
  } catch (error) {
    console.error("List audit logs error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
