const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Contract = sequelize.define(
  "Contract",
  {
    contractId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "contract_id",
    },
    // Master account contract
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "account_id",
    },
    // Service-level contract
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "service_id",
    },
    contractType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contract_type",
    },
    contractStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "contract_start_date",
    },
    contractEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "contract_end_date",
    },
    contractEffectiveDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "contract_effective_date",
    },
    srNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "sr_number",
    },
    srCreatedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "sr_created_date",
    },
    srSubmittedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "sr_submitted_date",
    },
    srAcceptedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "sr_accepted_date",
    },
    usageLimit: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "usage_limit",
    },
    entitlement: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "contracts",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Contract;
