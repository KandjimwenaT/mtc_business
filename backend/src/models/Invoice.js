const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Invoice = sequelize.define(
  "Invoice",
  {
    invoiceId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "invoice_id",
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "invoice_number",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_id",
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "corporate_id",
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "NAD",
    },
    status: {
      type: DataTypes.ENUM("issued", "paid", "overdue", "cancelled"),
      allowNull: false,
      defaultValue: "issued",
    },
    invoiceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "invoice_date",
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "paid_at",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "invoices",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Invoice;
