import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  port: Number(process.env.DB_PORT || 3306),
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'mydb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
