const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TicketInternalNote = sequelize.define(
  "TicketInternalNote",
  {
    noteId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "note_id",
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "ticket_id",
    },
    authorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "author_user_id",
    },
    authorName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "author_name",
    },
    authorRole: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "author_role",
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "ticket_internal_notes",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

module.exports = TicketInternalNote;
