const mysql = require("mysql2/promise");
const { Sequelize } = require("sequelize");
require("dotenv").config();

const dbName = process.env.DB_NAME || "mtc_business";
const dbUser = process.env.DB_USER || "root";
const dbPassword = process.env.DB_PASSWORD || "";
const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 3306);

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: "mysql",
  logging: false,
});

const connectDB = async () => {
  try {
    const bootstrap = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
    });
    const safeName = String(dbName).replace(/`/g, "");
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${safeName}\``);
    await bootstrap.end();

    await sequelize.authenticate();
    console.log("Database connected successfully");
    return sequelize;
  } catch (error) {
    console.error("Database connection error:", error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };

