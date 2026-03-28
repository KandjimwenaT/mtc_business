const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Person = sequelize.define(
  "Person",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
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
    type: {
      type: DataTypes.ENUM("executive_staff", "supervisor", "manager", "gm", "admin", "customer"),
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gmId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "gm_id",
    },
    managerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "manager_id",
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "corporate_id",
    },
    hasPortalAccess: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "persons",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = Person;
