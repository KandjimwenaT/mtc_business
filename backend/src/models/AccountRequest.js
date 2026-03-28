const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AccountRequest = sequelize.define(
  "AccountRequest",
  {
    requestId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "request_id",
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
      type: DataTypes.ENUM(
        "new_line",
        "plan_change",
        "line_suspension",
        "line_activation",
        "plan_upgrade",
        "number_change",
        "other"
      ),
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
      type: DataTypes.ENUM("pending", "approved", "rejected", "in_progress", "completed"),
      allowNull: false,
      defaultValue: "pending",
    },
    submittedBy: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "submitted_by",
    },
    processedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "processed_by",
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "processed_at",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "account_requests",
    underscored: true,
    timestamps: true,
  }
);

module.exports = AccountRequest;
