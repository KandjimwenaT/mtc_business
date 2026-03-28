const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GM = sequelize.define(
  "GM",
  {
    gmId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "gm_id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
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
  },
  {
    tableName: "gm",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = GM;
