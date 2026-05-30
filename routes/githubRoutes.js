// routes/githubRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Route definitions — maps HTTP verbs + paths to controller functions.
// No business logic lives here; this file is intentionally declarative.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const {
  analyzeProfile,
  refreshProfile,
  getAllProfiles,
  getProfileByUsername,
} = require('../controllers/githubController');

// ── GitHub analysis endpoints ─────────────────────────────────────────────────

// POST /api/github/:username
// Trigger full analysis for a developer — fetches GitHub data, runs analytics,
// stores results, and returns the intelligence report.
router.post('/github/:username', analyzeProfile);

// PUT /api/github/:username/refresh
// Incremental refresh — re-fetches repos, processes only updated ones,
// recalculates analytics, updates the database.
router.put('/github/:username/refresh', refreshProfile);

// ── Profile retrieval endpoints ───────────────────────────────────────────────

// GET /api/profiles
// List all analyzed profiles with pagination, sorting, and filtering.
// Query params: page, limit, sort, language, type
// Example: GET /api/profiles?page=1&limit=10&sort=followers&language=JavaScript
router.get('/profiles', getAllProfiles);

// GET /api/profiles/:username
// Retrieve detailed intelligence report for a single developer.
router.get('/profiles/:username', getProfileByUsername);

module.exports = router;
