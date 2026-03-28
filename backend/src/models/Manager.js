const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Manager = sequelize.define(
  "Manager",
  {
    managerId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "manager_id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
    },
    gmId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "gm_id",
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
    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "managers",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = Manager;
