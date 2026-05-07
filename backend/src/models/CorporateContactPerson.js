const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Junction table that lets a contact person (AccountManager) be linked
// to multiple corporates. Each (corporate, contact) pair is unique.
const CorporateContactPerson = sequelize.define(
  "CorporateContactPerson",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    corporateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "corporate_id",
    },
    accountManagerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_manager_id",
    },
  },
  {
    tableName: "corporate_contact_persons",
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["corporate_id", "account_manager_id"],
        name: "uq_corporate_contact_pair",
      },
    ],
  }
);

module.exports = CorporateContactPerson;
