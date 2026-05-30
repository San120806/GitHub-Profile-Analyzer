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
  console.log('🚀  GitHub Developer Intelligence API — starting up...');
  try {
    // Ensure DB schema is ready before serving any requests
    await initializeDatabase();

    // Wrap listen in a Promise so errors (e.g. EADDRINUSE) are catchable
    await new Promise((resolve, reject) => {
      const server = app.listen(PORT, '127.0.0.1', resolve);
      server.on('error', reject);
    });

    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────┐');
    console.log('  │     GitHub Developer Intelligence API                │');
    console.log('  │                                                      │');
    console.log(`  │  Server running on  →  http://localhost:${PORT}         │`);
    console.log('  │                                                      │');
    console.log('  │  Endpoints:                                          │');
    console.log('  │    POST  /api/github/:username                       │');
    console.log('  │    PUT   /api/github/:username/refresh               │');
    console.log('  │    GET   /api/profiles                               │');
    console.log('  │    GET   /api/profiles/:username                     │');
    console.log('  │    GET   /health                                     │');
    console.log('  └──────────────────────────────────────────────────────┘');
    console.log('');
  } catch (err) {
    console.error('❌  Failed to start server:');
    console.error('    Code   :', err.code || 'N/A');
    console.error('    Message:', err.message || '(empty)');
    console.error('    Detail :', err.sqlMessage || err.cause || '');
    process.exit(1);
  }
};

start();
