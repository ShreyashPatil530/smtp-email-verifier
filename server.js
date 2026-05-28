'use strict';

/**
 * HTTP server that exposes the email verifier as a REST API and serves a
 * simple web UI from /public. Designed to be deployed to platforms like
 * Render, Railway or Fly.io.
 *
 * Endpoints:
 *   GET  /              → web UI
 *   GET  /health        → liveness probe
 *   GET  /api/verify    → ?email=user@example.com
 *   POST /api/verify    → { "email": "user@example.com" }
 *   POST /api/verify-bulk → { "emails": ["a@x.com", "b@y.com"] } (max 20)
 */

const path = require('path');
const express = require('express');

const { verifyEmail } = require('./src/verifyEmail');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
// Most cloud platforms (Render, Heroku, Vercel) block outbound TCP port 25 to
// prevent spam. We expose this as a flag so the UI can show a banner.
const SMTP_BLOCKED_HOST = process.env.SMTP_BLOCKED === '1';

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    node: process.version,
    smtpBlocked: SMTP_BLOCKED_HOST,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/verify', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  const result = await verifyEmail(email, { timeout: 8000 });
  res.json(result);
});

app.post('/api/verify', async (req, res) => {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email : '';
  const result = await verifyEmail(email, { timeout: 8000 });
  res.json(result);
});

app.post('/api/verify-bulk', async (req, res) => {
  const emails = req.body && Array.isArray(req.body.emails) ? req.body.emails : [];
  if (emails.length === 0) {
    return res.status(400).json({ error: 'emails[] required' });
  }
  if (emails.length > 20) {
    return res.status(400).json({ error: 'Max 20 emails per request' });
  }
  const results = await Promise.all(
    emails.map((e) => verifyEmail(e, { timeout: 8000 })),
  );
  res.json({ count: results.length, results });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`📧 Email Verifier API running on port ${PORT}`);
  console.log(`   UI:     http://localhost:${PORT}/`);
  console.log(`   API:    http://localhost:${PORT}/api/verify?email=test@example.com`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  if (SMTP_BLOCKED_HOST) {
    console.log('   ⚠️  SMTP_BLOCKED=1 — RCPT step will report unknown.');
  }
});
