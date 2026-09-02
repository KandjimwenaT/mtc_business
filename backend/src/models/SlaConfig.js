const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const SlaConfig = sequelize.define(
  "SlaConfig",
  {
    slaConfigId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "sla_config_id",
    },
    department: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM("request", "complaint"),
      allowNull: false,
    },
    ticketType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "ticket_type",
    },
    targetHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "target_hours",
    },
    warningHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "warning_hours",
    },
    atRiskHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "at_risk_hours",
    },
    escalateL1Hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "escalate_l1_hours",
    },
    escalateL2Hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "escalate_l2_hours",
    },
    escalateL3Hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "escalate_l3_hours",
    },
    autoEscalate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "auto_escalate",
    },
    updatedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "updated_by_user_id",
    },
  },
  {
    tableName: "sla_configs",
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["department", "category", "ticket_type"],
        name: "sla_configs_department_category_type_unique",
      },
    ],
  }
);

module.exports = SlaConfig;
