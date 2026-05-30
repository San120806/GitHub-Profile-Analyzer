// controllers/githubController.js
// ─────────────────────────────────────────────────────────────────────────────
// Controller Layer — orchestrates GitHub service, analysis engine, and model.
// Each controller function handles exactly one endpoint's business logic.
// Express req/res objects are never passed into services or models.
// ─────────────────────────────────────────────────────────────────────────────

const { fetchUserProfile, fetchUserRepositories } = require('../services/githubService');
const { analyzeRepositories } = require('../utils/analyzer');
const {
  findProfileByUsername,
  upsertProfile,
  upsertRepositories,
  getRepositoriesByProfileId,
  replaceSkillDistribution,
  getSkillDistribution,
  listProfiles,
} = require('../models/profileModel');

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Performs the full analysis pipeline for a given username and set of repos.
 * Shared between the initial analyze and refresh endpoints.
 *
 * @param {Object} githubProfile - raw profile object from GitHub API
 * @param {Array}  repos         - array of repo objects to analyze
 * @returns {Promise<Object>}    full analytics response payload
 */
const runAnalysisPipeline = async (githubProfile, repos) => {
  const analytics = analyzeRepositories(repos);
  const now = new Date();

  // 1. Persist / refresh profile
  const profileId = await upsertProfile({
    username:        githubProfile.login,
    name:            githubProfile.name,
    bio:             githubProfile.bio,
    avatar_url:      githubProfile.avatar_url,
    github_url:      githubProfile.html_url,
    followers:       githubProfile.followers,
    following:       githubProfile.following,
    public_repos:    githubProfile.public_repos,
    developer_type:  analytics.developer_type,
    top_language:    analytics.top_language,
    tech_stack:      analytics.tech_stack,
    last_analyzed_at: now,
  });

  // 2. Persist repositories
  await upsertRepositories(profileId, repos);

  // 3. Replace skill distribution (full recalculation)
  await replaceSkillDistribution(profileId, analytics.language_distribution);

  // 4. Compose response
  return {
    username:              githubProfile.login,
    name:                  githubProfile.name,
    bio:                   githubProfile.bio,
    avatar_url:            githubProfile.avatar_url,
    github_url:            githubProfile.html_url,
    followers:             githubProfile.followers,
    following:             githubProfile.following,
    public_repos:          githubProfile.public_repos,
    developer_type:        analytics.developer_type,
    top_language:          analytics.top_language,
    language_distribution: analytics.language_distribution,
    tech_stack:            analytics.tech_stack,
    repo_stats:            analytics.repo_stats,
    repositories_analyzed: repos.length,
    last_analyzed_at:      now.toISOString(),
  };
};

// ── Controller: POST /api/github/:username ────────────────────────────────────

/**
 * Analyzes a GitHub developer profile.
 * Fetches profile + all repos from GitHub, runs the analysis engine,
 * stores results in MySQL, and returns the intelligence report.
 */
const analyzeProfile = async (req, res) => {
  try {
    const { username } = req.params;

    // Parallel fetch — profile and repositories are independent calls
    const [githubProfile, repos] = await Promise.all([
      fetchUserProfile(username),
      fetchUserRepositories(username),
    ]);

    const result = await runAnalysisPipeline(githubProfile, repos);

    return res.status(200).json({
      success: true,
      message: `Profile analyzed successfully for "${username}".`,
      data: result,
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
};

// ── Controller: PUT /api/github/:username/refresh ─────────────────────────────

/**
 * Incremental refresh — re-fetches repositories and processes only those
 * updated after last_analyzed_at, then recalculates full analytics.
 *
 * Optimization rationale:
 *   GitHub returns all repos regardless; the optimization is computational —
 *   we skip expensive analysis for repos that haven't changed, reducing
 *   unnecessary DB writes and recalculation cycles.
 */
const refreshProfile = async (req, res) => {
  try {
    const { username } = req.params;

    // Check if we've analyzed this profile before
    const existingProfile = await findProfileByUsername(username);
    const lastAnalyzedAt = existingProfile?.last_analyzed_at
      ? new Date(existingProfile.last_analyzed_at)
      : null;

    // Parallel fetch
    const [githubProfile, allRepos] = await Promise.all([
      fetchUserProfile(username),
      fetchUserRepositories(username),
    ]);

    // ── Incremental sync ──────────────────────────────────────────────────────
    // Filter to repos updated since last analysis; fall back to all repos if
    // this is a first-time analysis or last_analyzed_at is unavailable.
    let reposToProcess = allRepos;
    let skippedCount = 0;

    if (lastAnalyzedAt) {
      const updatedRepos = allRepos.filter(
        (r) => new Date(r.updated_at) > lastAnalyzedAt
      );
      skippedCount = allRepos.length - updatedRepos.length;

      // If repos have been updated, persist those incremental changes first
      if (updatedRepos.length > 0 && existingProfile) {
        await upsertRepositories(existingProfile.id, updatedRepos);
      }

      // Analytics recalculation always uses ALL stored repos for accuracy
      // (we need the full picture even when only a subset changed)
      reposToProcess = allRepos;
    }

    const result = await runAnalysisPipeline(githubProfile, reposToProcess);

    return res.status(200).json({
      success: true,
      message: `Profile refreshed for "${username}". ${skippedCount} repo(s) were unchanged and skipped from reprocessing.`,
      incremental_sync: {
        total_repos: allRepos.length,
        repos_updated: allRepos.length - skippedCount,
        repos_skipped: skippedCount,
        last_analyzed_at: lastAnalyzedAt?.toISOString() || null,
      },
      data: result,
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
};

// ── Controller: GET /api/profiles ─────────────────────────────────────────────

/**
 * Returns paginated, filtered, and sorted list of analyzed developer profiles.
 * Query params: page, limit, sort, language, type
 */
const getAllProfiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'last_analyzed_at',
      language,
      type,
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const { profiles, total } = await listProfiles({
      page: parsedPage,
      limit: parsedLimit,
      sort,
      language,
      type,
    });

    return res.status(200).json({
      success: true,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(total / parsedLimit),
      },
      data: profiles,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── Controller: GET /api/profiles/:username ───────────────────────────────────

/**
 * Returns the full stored intelligence report for a single developer.
 * Includes skill distribution and repositories from the DB.
 */
const getProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const profile = await findProfileByUsername(username);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `No analyzed profile found for "${username}". Run POST /api/github/${username} first.`,
      });
    }

    const [skillDistribution, repositories] = await Promise.all([
      getSkillDistribution(profile.id),
      getRepositoriesByProfileId(profile.id),
    ]);

    // Normalize tech_stack JSON field
    const techStack =
      typeof profile.tech_stack === 'string'
        ? JSON.parse(profile.tech_stack)
        : profile.tech_stack;

    return res.status(200).json({
      success: true,
      data: {
        ...profile,
        tech_stack: techStack,
        language_distribution: skillDistribution,
        repositories,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  analyzeProfile,
  refreshProfile,
  getAllProfiles,
  getProfileByUsername,
};
