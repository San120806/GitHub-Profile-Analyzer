// utils/analyzer.js
// ─────────────────────────────────────────────────────────────────────────────
// The Analysis Engine — completely independent of routes, controllers, and DB.
// Responsibilities:
//   1. Calculate language distribution (percentage per language)
//   2. Detect developer type (heuristic rule-based classification)
//   3. Detect tech stack (keyword matching across repo metadata)
//   4. Compute top language
//   5. Aggregate repository statistics
// ─────────────────────────────────────────────────────────────────────────────

// ── Rule sets ────────────────────────────────────────────────────────────────

const DEVELOPER_TYPE_RULES = {
  'AI/ML Engineer': {
    languages: ['python', 'r', 'julia'],
    keywords: [
      'tensorflow', 'pytorch', 'keras', 'sklearn', 'scikit',
      'machine learning', 'deep learning', 'neural network', 'llm', 'rag',
      'transformers', 'huggingface', 'nlp', 'computer vision',
      'langchain', 'openai', 'diffusion', 'yolo', 'bert',
    ],
  },
  'DevOps / Cloud Engineer': {
    languages: ['shell', 'hcl', 'dockerfile', 'yaml'],
    keywords: [
      'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins',
      'ci/cd', 'github actions', 'helm', 'aws', 'gcp', 'azure', 'devops',
      'infrastructure', 'pipeline', 'cloudformation', 'vagrant', 'puppet',
    ],
  },
  'Frontend Developer': {
    languages: ['javascript', 'typescript', 'html', 'css'],
    keywords: [
      'react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte',
      'tailwind', 'bootstrap', 'sass', 'scss', 'webpack', 'vite',
      'ui', 'frontend', 'landing page', 'responsive', 'remix',
      'gatsby', 'nuxt', 'storybook',
    ],
  },
  'Backend Developer': {
    languages: ['javascript', 'typescript', 'python', 'java', 'go', 'ruby', 'php', 'rust', 'c#', 'kotlin'],
    keywords: [
      'express', 'fastapi', 'django', 'flask', 'spring', 'rails',
      'api', 'rest', 'graphql', 'microservice', 'grpc', 'node',
      'postgres', 'mysql', 'mongodb', 'redis', 'backend', 'server',
      'gin', 'fiber', 'nestjs', 'laravel', 'actix',
    ],
  },
  'Mobile Developer': {
    languages: ['swift', 'kotlin', 'dart', 'objective-c', 'java'],
    keywords: [
      'flutter', 'react native', 'ios', 'android', 'swiftui', 'jetpack',
      'compose', 'expo', 'mobile', 'app store', 'play store',
    ],
  },
  'Systems / Low-Level Developer': {
    languages: ['c', 'c++', 'rust', 'assembly', 'zig'],
    keywords: [
      'embedded', 'firmware', 'kernel', 'driver', 'os', 'operating system',
      'memory', 'allocator', 'compiler', 'parser', 'interpreter', 'jit',
    ],
  },
};

const TECH_STACK_KEYWORDS = {
  // Frontend
  React: ['react', 'reactjs', 'react-dom', 'jsx'],
  'Next.js': ['next.js', 'nextjs', 'next-js'],
  'Vue.js': ['vue', 'vuejs', 'nuxt'],
  Angular: ['angular', 'angularjs'],
  Svelte: ['svelte', 'sveltekit'],
  // Backend
  'Node.js': ['node', 'nodejs', 'node.js'],
  Express: ['express', 'expressjs'],
  NestJS: ['nestjs', 'nest.js'],
  Django: ['django'],
  Flask: ['flask'],
  FastAPI: ['fastapi'],
  Spring: ['spring', 'springboot', 'spring boot'],
  Laravel: ['laravel'],
  Rails: ['rails', 'ruby on rails'],
  // Databases
  MongoDB: ['mongodb', 'mongoose', 'mongo'],
  PostgreSQL: ['postgres', 'postgresql'],
  MySQL: ['mysql'],
  Redis: ['redis'],
  SQLite: ['sqlite'],
  // DevOps
  Docker: ['docker', 'dockerfile', 'docker-compose'],
  Kubernetes: ['kubernetes', 'k8s', 'helm'],
  Terraform: ['terraform'],
  // Languages / Runtimes
  TypeScript: ['typescript', 'ts'],
  Python: ['python'],
  Go: ['golang', 'go-'],
  Rust: ['rust'],
  GraphQL: ['graphql', 'apollo'],
  // AI/ML
  TensorFlow: ['tensorflow', 'tf'],
  PyTorch: ['pytorch', 'torch'],
  'Scikit-learn': ['sklearn', 'scikit'],
  LangChain: ['langchain'],
  OpenAI: ['openai', 'gpt'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a single lowercase searchable string from a repository's
 * name, description, topics, and primary language.
 * @param {Object} repo - raw GitHub repo object
 * @returns {string}
 */
const buildRepoSearchText = (repo) => {
  const parts = [
    repo.name || '',
    repo.description || '',
    (repo.topics || []).join(' '),
    repo.language || '',
  ];
  return parts.join(' ').toLowerCase();
};

// ── Exported analysis functions ───────────────────────────────────────────────

/**
 * Calculates percentage-based language distribution from an array of repos.
 * Percentage is derived from repository count per language.
 * Repos without a detected language are skipped.
 *
 * @param {Array} repos - array of GitHub repository objects
 * @returns {Object} e.g. { JavaScript: 52, Python: 30, Go: 18 }
 */
const calculateLanguageDistribution = (repos) => {
  const langCount = {};
  let total = 0;

  for (const repo of repos) {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
      total++;
    }
  }

  if (total === 0) return {};

  const distribution = {};
  for (const [lang, count] of Object.entries(langCount)) {
    distribution[lang] = parseFloat(((count / total) * 100).toFixed(2));
  }

  // Sort descending by percentage for readability
  return Object.fromEntries(
    Object.entries(distribution).sort(([, a], [, b]) => b - a)
  );
};

/**
 * Determines the developer's primary specialization using heuristic rules.
 * Scores each developer type by matching dominant languages and keywords
 * against repo metadata, then returns the highest-scoring type.
 *
 * @param {Array} repos - array of GitHub repository objects
 * @param {Object} languageDistribution - output of calculateLanguageDistribution
 * @returns {string} e.g. "Backend Developer"
 */
const detectDeveloperType = (repos, languageDistribution) => {
  const scores = {};
  const dominantLangs = Object.keys(languageDistribution)
    .slice(0, 3)
    .map((l) => l.toLowerCase());

  for (const [type, rules] of Object.entries(DEVELOPER_TYPE_RULES)) {
    scores[type] = 0;

    // Language match: +5 per dominant language match (increased weight for better accuracy)
    for (const lang of dominantLangs) {
      if (rules.languages.includes(lang)) {
        scores[type] += 5;
      }
    }

    // Keyword match across all repos: +1 per keyword hit (using word-boundary regex to avoid substring false matches)
    for (const repo of repos) {
      const text = buildRepoSearchText(repo);
      for (const kw of rules.keywords) {
        // Use word-boundary regex to match whole words/phrases, not substrings
        // This prevents 'ai' from matching 'email', 'train', etc.
        // and 'ml' from matching 'html', 'xml', etc.
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(text)) {
          scores[type] += 1;
        }
      }
    }
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  return sorted[0][1] > 0 ? sorted[0][0] : 'Full-Stack Developer';
};

/**
 * Infers the technologies / frameworks used by the developer.
 * Matches keyword sets against repo name, description, topics, and language.
 *
 * @param {Array} repos - array of GitHub repository objects
 * @returns {string[]} e.g. ["Node.js", "Express", "Docker"]
 */
const detectTechStack = (repos) => {
  const detected = new Set();

  for (const repo of repos) {
    const text = buildRepoSearchText(repo);
    for (const [tech, keywords] of Object.entries(TECH_STACK_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        detected.add(tech);
      }
    }
  }

  return Array.from(detected);
};

/**
 * Returns the language with the highest percentage from the distribution.
 *
 * @param {Object} languageDistribution
 * @returns {string|null}
 */
const computeTopLanguage = (languageDistribution) => {
  const entries = Object.entries(languageDistribution);
  if (entries.length === 0) return null;
  return entries[0][0]; // already sorted descending
};

/**
 * Computes aggregate repository statistics.
 *
 * @param {Array} repos
 * @returns {Object}
 */
const aggregateRepoStats = (repos) => {
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
  const mostStarred = repos.reduce(
    (best, r) => (r.stargazers_count > (best?.stargazers_count || 0) ? r : best),
    null
  );

  return {
    total_repos: repos.length,
    total_stars: totalStars,
    total_forks: totalForks,
    most_starred_repo: mostStarred
      ? { name: mostStarred.name, stars: mostStarred.stargazers_count, url: mostStarred.html_url }
      : null,
  };
};

/**
 * Master analysis function — runs all sub-analyses and returns a
 * consolidated intelligence report.
 *
 * @param {Array} repos - raw array of GitHub repository objects
 * @returns {Object} full analytics payload
 */
const analyzeRepositories = (repos) => {
  const languageDistribution = calculateLanguageDistribution(repos);
  const topLanguage = computeTopLanguage(languageDistribution);
  const developerType = detectDeveloperType(repos, languageDistribution);
  const techStack = detectTechStack(repos);
  const repoStats = aggregateRepoStats(repos);

  return {
    language_distribution: languageDistribution,
    top_language: topLanguage,
    developer_type: developerType,
    tech_stack: techStack,
    repo_stats: repoStats,
  };
};

module.exports = {
  analyzeRepositories,
  calculateLanguageDistribution,
  detectDeveloperType,
  detectTechStack,
  computeTopLanguage,
  aggregateRepoStats,
};
