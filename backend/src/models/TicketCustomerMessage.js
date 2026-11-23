const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const TicketCustomerMessage = sequelize.define(
  "TicketCustomerMessage",
  {
    messageId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "message_id",
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
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "ticket_customer_messages",
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

module.exports = TicketCustomerMessage;
