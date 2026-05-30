# GitHub Developer Intelligence API

A lightweight **Developer Intelligence Engine** built with Node.js, Express.js, MySQL, and the GitHub Public API.

The system analyzes GitHub developer profiles, detects technology stacks, classifies developer specialization, stores processed analytics, and exposes scalable REST APIs with filtering, sorting, pagination, and incremental synchronization.

---

## Tech Stack

| Layer        | Technology                      |
|--------------|---------------------------------|
| Runtime      | Node.js                         |
| Framework    | Express.js                      |
| Database     | MySQL (via mysql2 connection pool) |
| External API | GitHub REST API v3              |
| Key Packages | axios, mysql2, dotenv, cors, nodemon |

---

## Architecture

```
Client
  ↓
Express Routes        (routes/githubRoutes.js)
  ↓
Controllers           (controllers/githubController.js)
  ↓  ↘
GitHub Service        (services/githubService.js)
        ↘
         Analysis Engine   (utils/analyzer.js)
  ↓
MySQL Database        (models/profileModel.js  ←  config/db.js)
```

---

## Project Structure

```
.
├── server.js                  # Entry point — boots DB schema then Express
├── config/
│   └── db.js                  # MySQL connection pool + schema auto-init
├── routes/
│   └── githubRoutes.js        # Route definitions (no business logic)
├── controllers/
│   └── githubController.js    # Orchestration layer per endpoint
├── services/
│   └── githubService.js       # GitHub API communication (paginated)
├── models/
│   └── profileModel.js        # All SQL queries (DAL)
├── utils/
│   └── analyzer.js            # Self-contained analysis engine
├── .env                       # Environment config (not committed)
├── package.json
└── README.md
```

---

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- MySQL ≥ 8 running locally

### 2. Create the MySQL database

```sql
CREATE DATABASE github_intelligence;
```

> Tables are created automatically on first server start (self-bootstrapping).

### 3. Configure environment

Edit `.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=github_intelligence

# Optional but recommended — increases GitHub rate limit from 60 to 5000 req/hr
# Generate at: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_personal_access_token
```

### 4. Install dependencies

```bash
npm install
```

### 5. Start the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

---

## API Reference

### POST `/api/github/:username`

Trigger full analysis for a GitHub developer.

- Fetches profile + all public repositories from GitHub
- Runs the analysis engine (language distribution, developer type, tech stack)
- Stores results in MySQL
- Returns the full intelligence report

**Example:**
```bash
POST http://localhost:3000/api/github/torvalds
```

**Response:**
```json
{
  "success": true,
  "message": "Profile analyzed successfully for \"torvalds\".",
  "data": {
    "username": "torvalds",
    "followers": 236000,
    "following": 0,
    "public_repos": 8,
    "developer_type": "Systems / Low-Level Developer",
    "top_language": "C",
    "language_distribution": { "C": 62.5, "Python": 25.0, "Shell": 12.5 },
    "tech_stack": ["Python"],
    "repo_stats": {
      "total_repos": 8,
      "total_stars": 220000,
      "total_forks": 65000,
      "most_starred_repo": { "name": "linux", "stars": 185000, "url": "..." }
    },
    "repositories_analyzed": 8,
    "last_analyzed_at": "2026-05-28T10:20:00.000Z"
  }
}
```

---

### PUT `/api/github/:username/refresh`

Incremental refresh — re-fetches repositories and processes only those updated since last analysis.

**Optimization:** Skips unchanged repos from re-processing. Analytics are recalculated using all repos for accuracy, but the DB write layer only upserts changed entries.

**Example:**
```bash
PUT http://localhost:3000/api/github/torvalds/refresh
```

**Response includes:**
```json
{
  "incremental_sync": {
    "total_repos": 8,
    "repos_updated": 2,
    "repos_skipped": 6,
    "last_analyzed_at": "2026-05-28T08:00:00.000Z"
  }
}
```

---

### GET `/api/profiles`

Returns paginated, filtered, and sorted list of all analyzed profiles.

| Query Param | Type   | Description                          | Example              |
|-------------|--------|--------------------------------------|----------------------|
| `page`      | int    | Page number (default: 1)             | `?page=2`            |
| `limit`     | int    | Items per page (default: 10, max 100)| `?limit=5`           |
| `sort`      | string | Sort column (see below)              | `?sort=followers`    |
| `language`  | string | Filter by top language               | `?language=Python`   |
| `type`      | string | Filter by developer type (partial)   | `?type=Backend`      |

**Supported `sort` values:** `followers`, `following`, `public_repos`, `analyzed_at`, `last_analyzed_at`, `created_at`, `username`

**Example:**
```bash
GET http://localhost:3000/api/profiles?page=1&limit=10&sort=followers&language=JavaScript
```

---

### GET `/api/profiles/:username`

Returns the full stored intelligence report for a developer — including repositories and skill distribution from the database.

**Example:**
```bash
GET http://localhost:3000/api/profiles/torvalds
```

---

### GET `/health`

Health check endpoint.

```json
{ "status": "ok", "service": "GitHub Developer Intelligence API", "timestamp": "..." }
```

---

## Database Schema

### `profiles`
| Column           | Type         | Notes                        |
|------------------|--------------|------------------------------|
| id               | INT PK AI    |                              |
| username         | VARCHAR(100) | UNIQUE                       |
| name             | VARCHAR(255) |                              |
| bio              | TEXT         |                              |
| avatar_url       | VARCHAR(500) |                              |
| github_url       | VARCHAR(500) |                              |
| followers        | INT          |                              |
| following        | INT          |                              |
| public_repos     | INT          |                              |
| developer_type   | VARCHAR(100) | Inferred by analysis engine  |
| top_language     | VARCHAR(100) |                              |
| tech_stack       | JSON         | Array of detected frameworks |
| last_analyzed_at | DATETIME     | Used for incremental sync    |
| created_at       | DATETIME     |                              |
| updated_at       | DATETIME     | Auto-updated by MySQL        |

### `repositories`
| Column      | Type         | Notes                       |
|-------------|--------------|-----------------------------|
| id          | INT PK AI    |                             |
| profile_id  | INT FK       | → profiles.id               |
| repo_name   | VARCHAR(255) | UNIQUE per profile          |
| description | TEXT         |                             |
| language    | VARCHAR(100) |                             |
| stars       | INT          |                             |
| forks       | INT          |                             |
| repo_url    | VARCHAR(500) |                             |
| updated_at  | DATETIME     |                             |

### `skill_distribution`
| Column     | Type          | Notes                       |
|------------|---------------|-----------------------------|
| id         | INT PK AI     |                             |
| profile_id | INT FK        | → profiles.id               |
| language   | VARCHAR(100)  | UNIQUE per profile          |
| percentage | DECIMAL(5,2)  | 0.00–100.00                 |

---

## Analysis Engine (`utils/analyzer.js`)

The analysis engine is fully independent of routes, controllers, and database logic.

### Language Distribution
- Counts repos per language, converts to percentage
- Sorted descending by percentage

### Developer Type Detection
- Heuristic scoring system across 6 developer archetypes:
  - `AI/ML Engineer`
  - `DevOps / Cloud Engineer`
  - `Frontend Developer`
  - `Backend Developer`
  - `Mobile Developer`
  - `Systems / Low-Level Developer`
- Each archetype has a list of **languages** (+2 pts each if dominant) and **keywords** (+1 pt each per repo match)
- Highest-scoring archetype wins; ties default to `Full-Stack Developer`

### Tech Stack Detection
- Keyword matching across repo name, description, topics, and language
- Detects 20+ technologies: React, Next.js, Express, Docker, TensorFlow, etc.

---

## Incremental Synchronization Strategy

```
PUT /api/github/:username/refresh
        │
        ├─ Fetch all repos from GitHub (network call always happens)
        │
        ├─ Filter: repos where updated_at > last_analyzed_at
        │         → these are "dirty" repos needing a DB update
        │
        ├─ Upsert only dirty repos  → fewer DB writes
        │
        └─ Recalculate analytics from ALL repos  → accurate full picture
```

This avoids:
- Re-inserting unchanged repo records
- Unnecessary DB write cycles
- Wasted processing on stale data
