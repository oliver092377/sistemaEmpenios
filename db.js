import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '1234',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'mydb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
