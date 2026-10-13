/**
 * Content Security Policy (CSP) & Image Hosting Consistency Test Suite
 *
 * Verifies that image-hosting origins in portfolio-data.json,
 * the local Express server CSP headers, and the static HTML meta CSP
 * are mutually aligned and strictly enforced without unnecessary wildcards.
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SERVER_PATH = path.join(ROOT_DIR, 'server.js');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const PORTFOLIO_DATA_PATH = path.join(ROOT_DIR, 'portfolio-data.json');

test('server.js sets strict CSP allowing Cloudinary CDN without wildcards', () => {
  assert.ok(fs.existsSync(SERVER_PATH), 'server.js must exist');
  const serverContent = fs.readFileSync(SERVER_PATH, 'utf8');

  // Verify CSP header declaration exists
  assert.match(serverContent, /res\.setHeader\(\s*['"]Content-Security-Policy['"]/);

  // Extract CSP string (bounded by double quotes)
  const cspMatch = serverContent.match(/res\.setHeader\(\s*['"]Content-Security-Policy['"],\s*"([^"]+)"/s);
  assert.ok(cspMatch, 'Must find Content-Security-Policy string in server.js');
  const csp = cspMatch[1];

  // Verify img-src directive
  const imgSrcMatch = csp.match(/img-src\s+([^;]+)/);
  assert.ok(imgSrcMatch, 'Must contain img-src directive');
  const imgSrc = imgSrcMatch[1].trim();

  // Must allow 'self', data:, and https://res.cloudinary.com
  assert.match(imgSrc, /'self'/, "img-src must allow 'self'");
  assert.match(imgSrc, /data:/, 'img-src must allow data:');
  assert.match(imgSrc, /https:\/\/res\.cloudinary\.com/, 'img-src must allow https://res.cloudinary.com');

  // Must NOT contain general wildcards
  assert.ok(!imgSrc.includes('*'), 'img-src must not contain broad wildcard *');
  assert.ok(!imgSrc.match(/\bhttps:\s/), 'img-src must not contain broad https: protocol scheme');

  // Verify all other security directives remain intact
  assert.match(csp, /default-src 'self'/, "default-src must remain 'self'");
  assert.match(csp, /script-src 'self'/, "script-src must remain 'self'");
  assert.match(csp, /style-src 'self' 'unsafe-inline'/, 'style-src must remain intact');
  assert.match(csp, /connect-src 'self' https:\/\/api\.web3forms\.com/, 'connect-src must remain intact');
  assert.match(csp, /object-src 'none'/, "object-src must remain 'none'");
  assert.match(csp, /base-uri 'self'/, "base-uri must remain 'self'");
  assert.match(csp, /frame-ancestors 'self'/, 'frame-ancestors must remain intact');
});

test('index.html declares narrowly-scoped CSP meta tag for static hosting (GitHub Pages)', () => {
  assert.ok(fs.existsSync(INDEX_HTML_PATH), 'index.html must exist');
  const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

  // Must declare meta http-equiv="Content-Security-Policy"
  const metaMatch = htmlContent.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(metaMatch, 'index.html must contain meta http-equiv="Content-Security-Policy"');
  const metaCsp = metaMatch[1];

  // Must enforce img-src with 'self', data:, and https://res.cloudinary.com
  assert.match(metaCsp, /img-src\s+([^;]+)/, 'Meta CSP must declare img-src');
  assert.match(metaCsp, /'self'/, "Meta CSP img-src must allow 'self'");
  assert.match(metaCsp, /data:/, 'Meta CSP img-src must allow data:');
  assert.match(metaCsp, /https:\/\/res\.cloudinary\.com/, 'Meta CSP must allow https://res.cloudinary.com');

  // Must NOT include frame-ancestors in meta element (unsupported by W3C spec in meta tags)
  assert.ok(!metaCsp.includes('frame-ancestors'), 'Meta CSP must not include header-only frame-ancestors');
});

test('portfolio-data.json images exclusively use approved origins (local or https://res.cloudinary.com)', () => {
  assert.ok(fs.existsSync(PORTFOLIO_DATA_PATH), 'portfolio-data.json must exist');
  const raw = fs.readFileSync(PORTFOLIO_DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const allowedRemoteHost = 'https://res.cloudinary.com';
  let totalImagesChecked = 0;
  let remoteImagesCount = 0;
  let localImagesCount = 0;
  const unauthorizedUrls = [];

  for (const project of data) {
    // Check thumbUrl
    if (project.thumbUrl) {
      totalImagesChecked++;
      if (project.thumbUrl.startsWith('https://')) {
        remoteImagesCount++;
        if (!project.thumbUrl.startsWith(allowedRemoteHost)) {
          unauthorizedUrls.push({ id: project.id, url: project.thumbUrl });
        }
      } else if (project.thumbUrl.startsWith('images/') || project.thumbUrl.startsWith('/images/')) {
        localImagesCount++;
      } else {
        unauthorizedUrls.push({ id: project.id, url: project.thumbUrl });
      }
    }

    // Check gallery images
    for (const img of project.images || []) {
      totalImagesChecked++;
      if (img.src.startsWith('https://')) {
        remoteImagesCount++;
        if (!img.src.startsWith(allowedRemoteHost)) {
          unauthorizedUrls.push({ id: project.id, url: img.src });
        }
      } else if (img.src.startsWith('images/') || img.src.startsWith('/images/')) {
        localImagesCount++;
      } else {
        unauthorizedUrls.push({ id: project.id, url: img.src });
      }
    }
  }

  assert.equal(
    unauthorizedUrls.length,
    0,
    `Unauthorized image URLs violating CSP policy: ${JSON.stringify(unauthorizedUrls)}`
  );
  assert.ok(remoteImagesCount > 0, 'Should contain verified remote Cloudinary images');
  assert.ok(localImagesCount > 0, 'Should contain verified local images (hybrid strategy)');
  assert.ok(totalImagesChecked >= 200, 'Should have verified all portfolio image references');
});

test('Frontend code preserves credential boundaries (no API secret exposure)', () => {
  const clientFiles = [
    INDEX_HTML_PATH,
    path.join(ROOT_DIR, 'app.js'),
    path.join(ROOT_DIR, 'portfolio.js'),
    path.join(ROOT_DIR, 'hero.js'),
    path.join(ROOT_DIR, 'navbar.js'),
  ];

  for (const filePath of clientFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(!content.includes('CLOUDINARY_API_SECRET'), `File ${path.basename(filePath)} must not expose API secret`);
      assert.ok(!content.includes('api.cloudinary.com'), `File ${path.basename(filePath)} must not call Cloudinary Admin API`);
    }
  }
});
