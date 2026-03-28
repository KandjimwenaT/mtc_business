const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ExecutiveStaff = sequelize.define(
  "ExecutiveStaff",
  {
    executiveId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "executive_id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "manager_id",
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
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "executive_staff",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = ExecutiveStaff;
