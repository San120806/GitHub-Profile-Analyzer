// config/db.js
// MySQL2 connection pool using TCP on 127.0.0.1 (explicit IPv4 — avoids IPv6 localhost issue).

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || '127.0.0.1',
  port:             parseInt(process.env.DB_PORT || '3306', 10),
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'github_intelligence',
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  connectTimeout:   10000,
  ssl:              { rejectUnauthorized: false },
});

/**
 * Initializes the database schema.
 * Creates all required tables if they do not already exist.
 * Called once at server startup so the app is self-bootstrapping.
 */
const initializeDatabase = async () => {
  console.log(`🔄  Connecting to MySQL at ${process.env.DB_HOST}:${process.env.DB_PORT}...`);

  // Hard 12-second timeout — prevents silent hang if caching_sha2_password RSA exchange stalls
  const connPromise = pool.getConnection();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(
      'DB_TIMEOUT: MySQL did not respond in 12s. Run: mysql -h 127.0.0.1 -u root -pRoot@1234 -e "SELECT 1;" to warm auth cache, then retry.'
    )), 12000)
  );

  const conn = await Promise.race([connPromise, timeoutPromise]);
  try {
    // ── profiles ────────────────────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        username        VARCHAR(100) NOT NULL UNIQUE,
        name            VARCHAR(255),
        bio             TEXT,
        avatar_url      VARCHAR(500),
        github_url      VARCHAR(500),
        followers       INT DEFAULT 0,
        following       INT DEFAULT 0,
        public_repos    INT DEFAULT 0,
        developer_type  VARCHAR(100),
        top_language    VARCHAR(100),
        tech_stack      JSON,
        last_analyzed_at DATETIME,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── repositories ────────────────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        profile_id  INT NOT NULL,
        repo_name   VARCHAR(255) NOT NULL,
        description TEXT,
        language    VARCHAR(100),
        stars       INT DEFAULT 0,
        forks       INT DEFAULT 0,
        repo_url    VARCHAR(500),
        updated_at  DATETIME,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_profile_repo (profile_id, repo_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── skill_distribution ──────────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS skill_distribution (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        profile_id  INT NOT NULL,
        language    VARCHAR(100) NOT NULL,
        percentage  DECIMAL(5,2) NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_profile_language (profile_id, language)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('✅  Database schema initialized successfully.');
  } catch (err) {
    console.error('❌  Failed to initialize database schema:', err.message);
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { pool, initializeDatabase };
