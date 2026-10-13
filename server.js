import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const host = '0.0.0.0';

// 1. Security: Remove Express fingerprinting header
app.disable('x-powered-by');

// 2. Security: Parse JSON with strict body size limit (prevents payload-based memory exhaustion)
app.use(express.json({ limit: '10kb' }));

// 3. Security: Comprehensive defensive HTTP headers
app.use((req, res, next) => {
  // Content Security Policy:
  // - Restricts scripts to same origin
  // - Allows necessary inline styles for dynamic UI state transitions
  // - Permits Web3Forms API endpoint for contact submissions
  // - Allows framing by AI Studio preview environment
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; connect-src 'self' https://api.web3forms.com; form-action 'self' https://api.web3forms.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com;"
  );

  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Control referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict unused powerful browser device APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Cross-Origin-Opener-Policy allows safe external navigation to links
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  next();
});

// 4. Security: In-memory sliding-window rate limiter for API endpoints (zero dependencies)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests/min per IP
const MAX_RATE_LIMIT_ENTRIES = 5000; // Hard memory cap against IP-flood attacks

const apiRateLimiter = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    clientData.count += 1;
  }

  rateLimitMap.set(ip, clientData);

  // Enforce memory bounds against unbounded growth
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) rateLimitMap.delete(key);
    }
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      let count = 0;
      for (const key of rateLimitMap.keys()) {
        rateLimitMap.delete(key);
        if (++count > MAX_RATE_LIMIT_ENTRIES / 2) break;
      }
    }
  }

  if (clientData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.'
    });
  }

  next();
};

// Periodic background cleanup of expired rate limit entries
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

// 5. Security: Block direct access to server-side code, configuration, lockfiles, and dependencies
const SENSITIVE_FILES = new Set([
  'server.js',
  'package.json',
  'package-lock.json',
  'bun.lock',
  'readme.md',
  '.env',
  '.env.example'
]);

app.use((req, res, next) => {
  let cleanPath = '';
  try {
    cleanPath = decodeURIComponent(req.path.split('?')[0]);
  } catch {
    return res.status(400).end('Bad Request');
  }

  const normalized = path.normalize(cleanPath).replace(/\\/g, '/');
  const baseName = path.basename(normalized);
  const lowerBaseName = baseName.toLowerCase();

  // Block access to node_modules, dotfiles, internal server code, lock files, source maps, or backups
  if (
    normalized.toLowerCase().startsWith('/node_modules') ||
    normalized.includes('/.') ||
    lowerBaseName.startsWith('.') ||
    SENSITIVE_FILES.has(lowerBaseName) ||
    /\.(lock|env|md|bak|map|tmp|swp|orig)$/i.test(lowerBaseName)
  ) {
    return res.status(404).sendFile(path.join(__dirname, 'index.html'));
  }

  next();
});

// 6. Security: Obsolete endpoint removal and API method filtering
// The legacy /api/config route has been completely removed as no frontend components depend on it.
// All requests targeting /api/* are rate-limited and rejected with 404 to prevent endpoint enumeration.
app.all('/api/*', apiRateLimiter, (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found'
  });
});

// 7. Serve public static assets with safe options
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  etag: true,
  lastModified: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// 8. Fallback to index.html for root or client navigation (only for GET / HEAD)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Reject any unhandled HTTP methods on all other routes
app.all('*', (req, res) => {
  res.status(405).set('Allow', 'GET, HEAD').end('Method Not Allowed');
});

// 9. Centralized Error Handler (suppresses stack traces in client responses)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
