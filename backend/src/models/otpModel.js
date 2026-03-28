const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");


const OTPModel = sequelize.define("OTP", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    otp: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
}, {
    timestamps: true,
    tableName: "otps",
    underscored: true,
});

module.exports = OTPModel;