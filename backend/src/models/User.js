const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "user_id",
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
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "must_change_password",
    },
    role: {
      type: DataTypes.ENUM(
        "admin",
        "executive_staff",
        "supervisor",
        "manager",
        "gm",
        "customer",
      ),
      allowNull: false,
      defaultValue: "executive_staff",
    },
    msGraphRefreshTokenEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "ms_graph_refresh_token_enc",
    },
    msGraphAccessTokenEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "ms_graph_access_token_enc",
    },
    msGraphTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "ms_graph_token_expires_at",
    },
    msGraphConnectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "ms_graph_connected_at",
    },
  },
  {
    tableName: "users",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

module.exports = User;
