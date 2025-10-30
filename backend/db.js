const mysql = require("mysql2/promise");

// Create a MySQL connection pool
const db = mysql.createPool({
  host: process.env.DBHOST||"127.0.0.1",
  user: process.env.DBUSER||"root",
  password: process.env.DBPASSWORD||"9035882709",
  database: process.env.DBNAME||"department",
  port: process.env.DBPORT||19335,
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
