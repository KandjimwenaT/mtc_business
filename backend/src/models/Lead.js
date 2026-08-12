const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Lead = sequelize.define(
  "Lead",
  {
    leadId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "lead_id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },
    companyName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "company_name",
    },
    contactPerson: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contact_person",
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "contact_phone",
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "contact_email",
    },
    leadSource: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "lead_source",
    },
    estimatedLines: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "estimated_lines",
    },
    productInterest: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "product_interest",
    },
    priority: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "priority",
    },
    expectedCloseDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "expected_close_date",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "notes",
    },
    status: {
      type: DataTypes.ENUM("pending", "in_progress", "ongoing", "completed"),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    tableName: "leads",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Lead;
