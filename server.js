// server.js
// ─────────────────────────────────────────────────────────────────────────────
// Application entry point.
// Bootstraps the Express server, applies global middleware, mounts routes,
// and verifies the database connection + schema before accepting traffic.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./config/db');
const githubRoutes = require('./routes/githubRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global Middleware ─────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware — lightweight, no external dependency
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api', githubRoutes);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'GitHub Developer Intelligence API',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler for unmatched routes ─────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
    available_routes: [
      'POST   /api/github/:username',
      'PUT    /api/github/:username/refresh',
      'GET    /api/profiles',
      'GET    /api/profiles/:username',
      'GET    /health',
    ],
  });
});

// ── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Attempt to initialize DB, but don't block server startup if it fails
    // In a serverless environment, we initialize on the fly inside the routes
    await initializeDatabase().catch(err => {
      console.error('Database initialization warning:', err.message);
    });

    if (process.env.VERCEL) {
      console.log('Running in Vercel Serverless mode.');
      return; // Do not call app.listen in Vercel
    }

    const PORT = process.env.PORT || 3000;

    // Wrap listen in a Promise so errors (e.g. EADDRINUSE) are catchable
    await new Promise((resolve, reject) => {
      const server = app.listen(PORT, '127.0.0.1', resolve);
      server.on('error', reject);
    });

    console.log(`
  ┌──────────────────────────────────────────────────────┐
  │     GitHub Developer Intelligence API                │
  │                                                      │
  │  Server running on  →  http://localhost:${PORT}         │
  │                                                      │
  │  Endpoints:                                          │
  │    POST  /api/github/:username                       │
  │    PUT   /api/github/:username/refresh               │
  │    GET   /api/profiles                               │
  │    GET   /api/profiles/:username                     │
  │    GET   /health                                     │
  └──────────────────────────────────────────────────────┘
    `);
  } catch (error) {
    console.error('❌  Failed to start server:\n', error);
    process.exit(1);
  }
};

start();
module.exports = app;
