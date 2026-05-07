const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TicketActivityLog = sequelize.define(
  "TicketActivityLog",
  {
    activityId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "activity_id",
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "ticket_id",
    },
    actorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "actor_user_id",
    },
    actorName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "actor_name",
    },
    actorRole: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "actor_role",
    },
    previousStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "previous_status",
    },
    newStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "new_status",
    },
    actionTaken: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "action_taken",
    },
    resolutionPreview: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "resolution_preview",
    },
    notesPreview: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "notes_preview",
    },
  },
  {
    tableName: "ticket_activity_logs",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

module.exports = TicketActivityLog;
