const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Corporate = sequelize.define(
  "Corporate",
  {
    corporateId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "corporate_id",
    },
    corporateNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "corporate_number",
    },
    corporateName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "corporate_name",
    },
    corporateType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "corporate_type",
    },
    businessEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "business_email",
    },
    industry: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "manager_id",
    },
    executiveId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "executive_id",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
    approvalStatus: {
      type: DataTypes.ENUM("pending", "waiting_approval", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
      field: "approval_status",
    },
  },
  {
    tableName: "corporates",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Corporate;
