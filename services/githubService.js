// services/githubService.js
// ─────────────────────────────────────────────────────────────────────────────
// GitHub API Service Layer
// Responsible ONLY for communication with the GitHub REST API.
// All HTTP logic is isolated here so controllers stay thin.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
require('dotenv').config();

// Build auth header once at module load to avoid recreating on every call.
const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN && {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  }),
};

const GITHUB_BASE = 'https://api.github.com';

/**
 * Fetches a GitHub user's public profile.
 *
 * @param {string} username
 * @returns {Promise<Object>} GitHub user object
 * @throws {Error} with a meaningful message if user not found or API error
 */
const fetchUserProfile = async (username) => {
  try {
    const { data } = await axios.get(`${GITHUB_BASE}/users/${username}`, {
      headers: githubHeaders,
    });
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw new Error(`GitHub user "${username}" not found.`);
    }
    if (err.response?.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Add a GITHUB_TOKEN to .env to increase limit.');
    }
    throw new Error(`GitHub API error: ${err.message}`);
  }
};

/**
 * Fetches ALL public repositories for a user via paginated requests.
 * GitHub returns a max of 100 repos per page; this handles multi-page users.
 *
 * @param {string} username
 * @returns {Promise<Array>} full array of repository objects
 */
const fetchUserRepositories = async (username) => {
  const allRepos = [];
  let page = 1;
  const perPage = 100; // GitHub's maximum allowed per_page

  while (true) {
    try {
      const { data } = await axios.get(
        `${GITHUB_BASE}/users/${username}/repos`,
        {
          headers: githubHeaders,
          params: {
            per_page: perPage,
            page,
            sort: 'updated',  // most recently updated first — useful for incremental sync
            direction: 'desc',
          },
        }
      );

      allRepos.push(...data);

      // GitHub stops pagination when a page returns fewer items than requested
      if (data.length < perPage) break;
      page++;
    } catch (err) {
      if (err.response?.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Add a GITHUB_TOKEN to .env.');
      }
      throw new Error(`Failed to fetch repositories: ${err.message}`);
    }
  }

  return allRepos;
};

module.exports = { fetchUserProfile, fetchUserRepositories };
