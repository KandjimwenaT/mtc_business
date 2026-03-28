const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AccountManager = sequelize.define(
  "AccountManager",
  {
    accountManagerId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "account_manager_id",
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "first_name",
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "last_name",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "email",
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "phone",
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "corporate_id",
    },
    hasPortalAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "has_portal_access",
    },
  },
  {
    tableName: "account_managers",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = AccountManager;

