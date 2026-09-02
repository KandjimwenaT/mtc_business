const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    auditId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "audit_id",
    },
    actorUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "actor_user_id",
    },
    actorName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "actor_name",
    },
    actorEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "actor_email",
    },
    actorRole: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "actor_role",
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "action_type",
    },
    entityType: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "entity_type",
    },
    entityId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "entity_id",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "ip_address",
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["created_at"] },
      { fields: ["department"] },
      { fields: ["action_type"] },
      { fields: ["actor_user_id"] },
    ],
  }
);

module.exports = AuditLog;
