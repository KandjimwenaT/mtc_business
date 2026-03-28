const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Ticket = sequelize.define(
  "Ticket",
  {
    ticketId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "ticket_id",
    },
    ticketNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "ticket_number",
    },
    category: {
      type: DataTypes.ENUM("request", "complaint"),
      allowNull: false,
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
      type: DataTypes.STRING,
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
      defaultValue: "medium",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        "new",
        "assigned",
        "in_progress",
        "escalated",
        "resolved",
        "closed",
        "rejected"
      ),
      allowNull: false,
      defaultValue: "new",
    },
    submittedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "submitted_by",
    },
    assignedTo: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "assigned_to",
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
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "closed_at",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    slaDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "sla_deadline",
    },
  },
  {
    tableName: "tickets",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Ticket;
