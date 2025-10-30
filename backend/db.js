const mysql = require("mysql2/promise");

// Create a MySQL connection pool
const db = mysql.createPool({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPASSWORD,
  database: process.env.DBNAME,
  port: process.env.DBPORT||19335,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "ballast.proxy.rlwy.net",
  port: process.env.DB_PORT || 19335,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "KJAmtjCVlJOYYmONvoMnGPGvqTnijJPM",
  database: process.env.DB_NAME || "railway",
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
