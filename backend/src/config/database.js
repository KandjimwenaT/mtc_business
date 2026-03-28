const { Sequelize } = require("sequelize");
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'mtc_business',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false, 
    }
);

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected successfully');
        return sequelize;
    } catch (error) {
        console.error('Database connection error:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };

