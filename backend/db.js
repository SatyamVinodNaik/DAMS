const mysql = require("mysql2/promise");

// Create a MySQL connection pool
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '9035882709',
  database: 'department',
  port: '3306',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ Test connection on startup
(async () => {
  try {
    const conn = await db.getConnection();
    console.log("✅ Connected to MySQL database");
    conn.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
})();

module.exports = db;
