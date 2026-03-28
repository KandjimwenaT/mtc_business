const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ControlCard = sequelize.define(
  "ControlCard",
  {
    controlCardId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "control_card_id",
    },
    visitId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: "visit_id",
    },
    executiveId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "executive_id",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_id",
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "account_name",
    },
    visitDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "visit_date",
    },
    csrManager: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "csr_manager",
    },
    customerParticipants: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "customer_participants",
    },
    visitObjective: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "visit_objective",
    },
    slaCompliance: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "sla_compliance",
    },
    openTickets: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "open_tickets",
    },
    criticalIncidents: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "critical_incidents",
    },
    risksOperational: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "risks_operational",
    },
    risksCommercial: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "risks_commercial",
    },
    risksCompetitive: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "risks_competitive",
    },
    opportunitiesUpsell: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "opportunities_upsell",
    },
    opportunitiesProcess: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "opportunities_process",
    },
    actionItems: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "action_items",
      get() {
        const raw = this.getDataValue("actionItems");
        return raw ? JSON.parse(raw) : [];
      },
      set(val) {
        this.setDataValue("actionItems", JSON.stringify(val || []));
      },
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "submitted_at",
    },
    geoLatitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      field: "geo_latitude",
    },
    geoLongitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      field: "geo_longitude",
    },
    // Filled in after completion — Section 3
    customerFeedback: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "customer_feedback",
    },
    // Filled in after completion — Section 7
    accountHealth: {
      type: DataTypes.ENUM("green", "amber", "red"),
      allowNull: true,
      field: "account_health",
    },
  },
  {
    tableName: "control_cards",
    underscored: true,
    timestamps: true,
  }
);

module.exports = ControlCard;
