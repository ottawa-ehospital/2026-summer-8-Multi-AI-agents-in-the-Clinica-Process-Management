const mysql2 = require("mysql2/promise");

let pool;

function getPool() {
  if (!pool) {
    pool = mysql2.createPool({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "ehospital",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log(
      `MySQL pool created → ${process.env.DB_HOST || "localhost"}:${
        process.env.DB_PORT || 3306
      }/${process.env.DB_NAME || "ehospital"}`
    );
  }
  return pool;
}

/**
 * Execute a SQL query and return rows.
 * Compatible with the legacy callback-style usage in chatRouter.js:
 *   const result = await mysql.query(sql);
 */
async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params || []);
  return rows;
}

module.exports = { query, getPool };
