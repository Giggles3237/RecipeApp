const mysql = require('mysql2/promise');
require('dotenv').config();

// All connection settings come from environment variables (see server/.env.example).
// Never put real hostnames or passwords in this file — the repo is public.
const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing database settings in .env: ${missing.join(', ')}`);
}

// Azure MySQL requires TLS. Certificates are verified by default; set
// DB_SSL_REJECT_UNAUTHORIZED=false only as a temporary workaround.
const useSsl = process.env.DB_SSL !== 'false';
const ssl = useSsl
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : undefined;

// Create a connection pool to reuse connections instead of opening one per query
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl,
});

module.exports = pool;
