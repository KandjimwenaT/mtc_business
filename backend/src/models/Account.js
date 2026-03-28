const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Account = sequelize.define(
  "Account",
  {
    accountId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "account_id",
    },
    parentAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "parent_account_id",
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "corporate_id",
    },
    accountNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "account_number",
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "account_name",
    },
    accountType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "account_type",
    },
    executiveId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "executive_id",
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "manager_id",
    },
    contactFirstName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contact_first_name",
    },
    contactLastName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contact_last_name",
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contact_email",
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "contact_phone",
    },
    industry: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
    approvalStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
      field: "approval_status",
    },
  },
  {
    tableName: "accounts",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Account;
