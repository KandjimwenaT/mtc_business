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
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by_user_id",
    },
    createdByRole: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "created_by_role",
    },
    createdByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "created_by_name",
    },
    createdForAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_for_account_id",
    },
    createdForCustomerUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_for_customer_user_id",
    },
    sourceChannel: {
      type: DataTypes.ENUM("portal", "email", "phone"),
      allowNull: false,
      defaultValue: "portal",
      field: "source_channel",
    },
    sourceContextNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "source_context_note",
    },
    attachmentUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "attachment_url",
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
