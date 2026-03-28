const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Service = sequelize.define(
  "Service",
  {
    serviceId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "service_id",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_id",
    },
    msisdn: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    serviceType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "service_type",
    },
    status: {
      type: DataTypes.ENUM("active", "suspended", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "services",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = Service;
