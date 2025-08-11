const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool to reuse connections instead of opening one per query
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'sales-db.mysql.database.azure.com',
  user: process.env.DB_USER || 'clasko',
  password: process.env.DB_PASSWORD || 'your_clasko_password',
  database: process.env.DB_NAME || 'recipe_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
