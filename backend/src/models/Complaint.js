const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Complaint = sequelize.define(
  "Complaint",
  {
    complaintId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "complaint_id",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_id",
    },
    executiveId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "executive_id",
    },
    type: {
      type: DataTypes.ENUM("billing", "service", "network", "support", "technical", "other"),
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("high", "medium", "low"),
      allowNull: false,
      defaultValue: "medium",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "open", "in_progress", "resolved", "closed"),
      allowNull: false,
      defaultValue: "pending",
    },
    submittedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "submitted_by",
    },
    resolution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "resolved_at",
    },
  },
  {
    tableName: "complaints",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Complaint;
