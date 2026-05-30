// models/profileModel.js
// ─────────────────────────────────────────────────────────────────────────────
// Data Access Layer — all SQL queries are centralized here.
// Controllers and services NEVER write raw SQL; they call these model methods.
// This makes the codebase testable and the persistence layer swappable.
// ─────────────────────────────────────────────────────────────────────────────

const { pool } = require('../config/db');

// ── Profile operations ────────────────────────────────────────────────────────

/**
 * Returns a stored profile by username, or null if not found.
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
const findProfileByUsername = async (username) => {
  const [rows] = await pool.query(
    'SELECT * FROM profiles WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
};

/**
 * Upserts a profile row.
 * On duplicate username, all analytics fields are refreshed.
 *
 * @param {Object} profileData
 * @returns {Promise<number>} inserted/updated profile id
 */
const upsertProfile = async (profileData) => {
  const {
    username, name, bio, avatar_url, github_url,
    followers, following, public_repos,
    developer_type, top_language, tech_stack,
    last_analyzed_at,
  } = profileData;

  const [result] = await pool.query(
    `INSERT INTO profiles
       (username, name, bio, avatar_url, github_url,
        followers, following, public_repos,
        developer_type, top_language, tech_stack,
        last_analyzed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name            = VALUES(name),
       bio             = VALUES(bio),
       avatar_url      = VALUES(avatar_url),
       github_url      = VALUES(github_url),
       followers       = VALUES(followers),
       following       = VALUES(following),
       public_repos    = VALUES(public_repos),
       developer_type  = VALUES(developer_type),
       top_language    = VALUES(top_language),
       tech_stack      = VALUES(tech_stack),
       last_analyzed_at = VALUES(last_analyzed_at)`,
    [
      username, name, bio, avatar_url, github_url,
      followers, following, public_repos,
      developer_type, top_language,
      JSON.stringify(tech_stack),
      last_analyzed_at,
    ]
  );

  // On INSERT result.insertId holds the new id;
  // on UPDATE it holds the existing id (via LAST_INSERT_ID trick in mysql2).
  if (result.insertId) return result.insertId;

  // Fallback: re-fetch the id for an UPDATE that didn't change the PK
  const profile = await findProfileByUsername(username);
  return profile.id;
};

// ── Repository operations ─────────────────────────────────────────────────────

/**
 * Bulk-upserts repository rows for a profile.
 * Uses INSERT … ON DUPLICATE KEY UPDATE to handle re-analysis efficiently.
 *
 * @param {number} profileId
 * @param {Array}  repos - array of GitHub repository objects
 * @returns {Promise<void>}
 */
const upsertRepositories = async (profileId, repos) => {
  if (!repos || repos.length === 0) return;

  // Build a multi-row VALUES list for a single query — far more efficient
  // than individual INSERT statements in a loop.
  const values = repos.map((r) => [
    profileId,
    r.name,
    r.description || null,
    r.language || null,
    r.stargazers_count || 0,
    r.forks_count || 0,
    r.html_url || null,
    r.updated_at ? new Date(r.updated_at) : null,
  ]);

  await pool.query(
    `INSERT INTO repositories
       (profile_id, repo_name, description, language, stars, forks, repo_url, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       language    = VALUES(language),
       stars       = VALUES(stars),
       forks       = VALUES(forks),
       repo_url    = VALUES(repo_url),
       updated_at  = VALUES(updated_at)`,
    [values]
  );
};

/**
 * Returns all stored repositories for a profile.
 * @param {number} profileId
 * @returns {Promise<Array>}
 */
const getRepositoriesByProfileId = async (profileId) => {
  const [rows] = await pool.query(
    'SELECT * FROM repositories WHERE profile_id = ? ORDER BY stars DESC',
    [profileId]
  );
  return rows;
};

// ── Skill distribution operations ─────────────────────────────────────────────

/**
 * Replaces skill_distribution rows for a profile atomically.
 * Deletes the existing distribution first, then inserts the new one.
 * This is simpler and safer than upsert for a full recalculation.
 *
 * @param {number} profileId
 * @param {Object} distribution - e.g. { JavaScript: 52, Python: 30 }
 * @returns {Promise<void>}
 */
const replaceSkillDistribution = async (profileId, distribution) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'DELETE FROM skill_distribution WHERE profile_id = ?',
      [profileId]
    );

    const entries = Object.entries(distribution);
    if (entries.length > 0) {
      const values = entries.map(([lang, pct]) => [profileId, lang, pct]);
      await conn.query(
        'INSERT INTO skill_distribution (profile_id, language, percentage) VALUES ?',
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Returns skill distribution for a profile as an object.
 * @param {number} profileId
 * @returns {Promise<Object>} e.g. { JavaScript: 52, Python: 30 }
 */
const getSkillDistribution = async (profileId) => {
  const [rows] = await pool.query(
    'SELECT language, percentage FROM skill_distribution WHERE profile_id = ? ORDER BY percentage DESC',
    [profileId]
  );
  return rows.reduce((acc, r) => ({ ...acc, [r.language]: parseFloat(r.percentage) }), {});
};

// ── Profile listing (with filtering, sorting, pagination) ─────────────────────

/**
 * Returns a paginated, filtered, and sorted list of profiles.
 *
 * @param {Object} options
 * @param {number} options.page      - 1-indexed page number
 * @param {number} options.limit     - items per page
 * @param {string} options.sort      - column to sort by
 * @param {string} options.language  - filter by top_language
 * @param {string} options.type      - filter by developer_type (partial match)
 * @returns {Promise<{ profiles: Array, total: number, page: number, limit: number }>}
 */
const listProfiles = async ({ page = 1, limit = 10, sort = 'last_analyzed_at', language, type } = {}) => {
  // Whitelist sortable columns to prevent SQL injection via sort param
  const SORTABLE = {
    followers: 'followers',
    following: 'following',
    public_repos: 'public_repos',
    analyzed_at: 'last_analyzed_at',
    last_analyzed_at: 'last_analyzed_at',
    created_at: 'created_at',
    username: 'username',
  };
  const sortColumn = SORTABLE[sort] || 'last_analyzed_at';
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (language) {
    conditions.push('top_language = ?');
    params.push(language);
  }
  if (type) {
    conditions.push('developer_type LIKE ?');
    params.push(`%${type}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM profiles ${whereClause}`,
    params
  );

  const [profiles] = await pool.query(
    `SELECT * FROM profiles ${whereClause} ORDER BY ${sortColumn} DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Parse JSON tech_stack string back to array
  const parsed = profiles.map((p) => ({
    ...p,
    tech_stack: typeof p.tech_stack === 'string' ? JSON.parse(p.tech_stack) : p.tech_stack,
  }));

  return { profiles: parsed, total, page, limit };
};

module.exports = {
  findProfileByUsername,
  upsertProfile,
  upsertRepositories,
  getRepositoriesByProfileId,
  replaceSkillDistribution,
  getSkillDistribution,
  listProfiles,
};
