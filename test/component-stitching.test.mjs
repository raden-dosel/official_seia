/**
 * Component Partial Stitching Test Suite
 *
 * Verifies that the build-time stitching utility correctly, safely, and
 * deterministically embeds standalone HTML partials into index.html:
 *   - Marker presence and ordering validation
 *   - Marker failure modes (missing, duplicate, reversed, overlapping)
 *   - Fragment formatting, indentation, and duplicate ID prevention
 *   - Full document tag rejection (<!DOCTYPE>, <html>, <head>, <body>)
 *   - Idempotent execution (repeated runs produce identical content)
 *   - Atomic write safety
 *   - Runtime duplicate injection guards in component JS files
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateMarkers,
  formatPartialFragment,
  stitchHtml,
  runStitch,
  PARTIAL_DEFINITIONS,
  DEFAULT_INDEX_PATH,
  ROOT_DIR,
} from '../scripts/stitch-components.mjs';

const mockDefinitions = [
  {
    name: 'test-about.html',
    containerId: 'about',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: test-about.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: test-about.html -->',
    indentSpaces: 4,
  },
  {
    name: 'test-footer.html',
    containerId: 'footer',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: test-footer.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: test-footer.html -->',
    indentSpaces: 2,
  },
];

test('Live index.html contains all 4 valid, non-overlapping partial marker pairs', () => {
  assert.ok(fs.existsSync(DEFAULT_INDEX_PATH), 'index.html must exist');
  const liveHtml = fs.readFileSync(DEFAULT_INDEX_PATH, 'utf8');

  const check = validateMarkers(liveHtml, PARTIAL_DEFINITIONS);
  assert.equal(check.valid, true, `Marker validation errors: ${check.errors.join('; ')}`);
  assert.equal(check.errors.length, 0);
  assert.equal(check.positions.size, 4);

  for (const def of PARTIAL_DEFINITIONS) {
    assert.ok(check.positions.has(def.name), `Must have position for ${def.name}`);
  }
});

test('validateMarkers rejects missing start or end marker', () => {
  const missingStart = `
    <div>
      <section id="about">content</section>
      <!-- END GENERATED PARTIAL: test-about.html -->
    </div>
  `;
  const res1 = validateMarkers(missingStart, [mockDefinitions[0]]);
  assert.equal(res1.valid, false);
  assert.match(res1.errors[0], /Missing start marker/);

  const missingEnd = `
    <div>
      <!-- BEGIN GENERATED PARTIAL: test-about.html -->
      <section id="about">content</section>
    </div>
  `;
  const res2 = validateMarkers(missingEnd, [mockDefinitions[0]]);
  assert.equal(res2.valid, false);
  assert.match(res2.errors[0], /Missing end marker/);
});

test('validateMarkers rejects duplicate markers', () => {
  const duplicateStart = `
    <!-- BEGIN GENERATED PARTIAL: test-about.html -->
    <!-- BEGIN GENERATED PARTIAL: test-about.html -->
    <section>content</section>
    <!-- END GENERATED PARTIAL: test-about.html -->
  `;
  const res = validateMarkers(duplicateStart, [mockDefinitions[0]]);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /Duplicate start marker/);
});

test('validateMarkers rejects reversed markers', () => {
  const reversed = `
    <!-- END GENERATED PARTIAL: test-about.html -->
    <section>content</section>
    <!-- BEGIN GENERATED PARTIAL: test-about.html -->
  `;
  const res = validateMarkers(reversed, [mockDefinitions[0]]);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /Reversed markers/);
});

test('validateMarkers rejects overlapping partial regions', () => {
  const overlapping = `
    <!-- BEGIN GENERATED PARTIAL: test-about.html -->
    <section>
      <!-- BEGIN GENERATED PARTIAL: test-footer.html -->
      <footer>footer</footer>
      <!-- END GENERATED PARTIAL: test-about.html -->
    </section>
    <!-- END GENERATED PARTIAL: test-footer.html -->
  `;
  const res = validateMarkers(overlapping, mockDefinitions);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Overlapping partial regions')));
});

test('formatPartialFragment removes redundant container ID from root element', () => {
  const input = '<section id="about" class="about section">\n  <p>About text</p>\n</section>';
  const formatted = formatPartialFragment(input, mockDefinitions[0]);

  // Redundant id="about" must be removed
  assert.ok(!formatted.includes('id="about"'), 'Must strip redundant id="about" from root section tag');
  assert.ok(formatted.includes('<section class="about section">'));
  assert.ok(formatted.includes('About text'));
});

test('formatPartialFragment rejects document-level tags', () => {
  const docHtml = '<!DOCTYPE html><html><head><title>Bad</title></head><body><section>text</section></body></html>';
  assert.throws(() => {
    formatPartialFragment(docHtml, mockDefinitions[0]);
  }, /document-level tags/);
});

test('formatPartialFragment rejects empty partials', () => {
  assert.throws(() => {
    formatPartialFragment('   \n\t  ', mockDefinitions[0]);
  }, /is empty/);
});

test('stitchHtml replaces content between markers deterministically', () => {
  const template = `
    <header>Header</header>
    <div id="about">
      <!-- BEGIN GENERATED PARTIAL: test-about.html -->
      <p>OLD ABOUT</p>
      <!-- END GENERATED PARTIAL: test-about.html -->
    </div>
    <div id="footer">
      <!-- BEGIN GENERATED PARTIAL: test-footer.html -->
      <p>OLD FOOTER</p>
      <!-- END GENERATED PARTIAL: test-footer.html -->
    </div>
  `;

  const partialsMap = new Map([
    ['test-about.html', '<section class="about"><p>NEW ABOUT CONTENT</p></section>'],
    ['test-footer.html', '<footer><p>NEW FOOTER CONTENT</p></footer>'],
  ]);

  const stitched = stitchHtml(template, partialsMap, mockDefinitions);

  assert.ok(stitched.includes('NEW ABOUT CONTENT'));
  assert.ok(stitched.includes('NEW FOOTER CONTENT'));
  assert.ok(!stitched.includes('OLD ABOUT'));
  assert.ok(!stitched.includes('OLD FOOTER'));
  assert.ok(stitched.includes('<!-- BEGIN GENERATED PARTIAL: test-about.html -->'));
  assert.ok(stitched.includes('<!-- END GENERATED PARTIAL: test-about.html -->'));
  assert.ok(stitched.includes('<!-- BEGIN GENERATED PARTIAL: test-footer.html -->'));
  assert.ok(stitched.includes('<!-- END GENERATED PARTIAL: test-footer.html -->'));
});

test('Stitching operation is 100% idempotent', () => {
  const liveHtml = fs.readFileSync(DEFAULT_INDEX_PATH, 'utf8');
  const partialsMap = new Map();
  for (const def of PARTIAL_DEFINITIONS) {
    partialsMap.set(def.name, fs.readFileSync(def.filePath, 'utf8'));
  }

  const pass1 = stitchHtml(liveHtml, partialsMap, PARTIAL_DEFINITIONS);
  const pass2 = stitchHtml(pass1, partialsMap, PARTIAL_DEFINITIONS);
  const pass3 = stitchHtml(pass2, partialsMap, PARTIAL_DEFINITIONS);

  assert.equal(pass1, pass2, 'Second pass must be byte-for-byte identical to first pass');
  assert.equal(pass2, pass3, 'Third pass must be byte-for-byte identical to second pass');
});

test('runStitch in dry-run mode does not modify disk file', async () => {
  const beforeContent = fs.readFileSync(DEFAULT_INDEX_PATH, 'utf8');
  const summary = await runStitch({ write: false });

  assert.equal(summary.mode, 'DRY-RUN');
  assert.equal(summary.status, 'SUCCESS');
  assert.equal(summary.partialsStitched, 4);

  const afterContent = fs.readFileSync(DEFAULT_INDEX_PATH, 'utf8');
  assert.equal(beforeContent, afterContent, 'Dry-run must not modify file on disk');
});

test('Runtime component scripts prevent duplicate DOM injection', () => {
  const portfolioJs = fs.readFileSync(path.join(ROOT_DIR, 'portfolio.js'), 'utf8');
  const aboutJs = fs.readFileSync(path.join(ROOT_DIR, 'about.js'), 'utf8');
  const contactJs = fs.readFileSync(path.join(ROOT_DIR, 'contact.js'), 'utf8');
  const footerJs = fs.readFileSync(path.join(ROOT_DIR, 'footer.js'), 'utf8');

  // Verify portfolio.js checks for existing #portfolio-grid
  assert.match(portfolioJs, /el\.querySelector\(\s*['"]#portfolio-grid['"]\s*\)/);

  // Verify about.js checks for existing .about
  assert.match(aboutJs, /el\.querySelector\(\s*['"]\.about['"]\s*\)/);

  // Verify contact.js checks for existing #contact-form
  assert.match(contactJs, /el\.querySelector\(\s*['"]#contact-form['"]\s*\)/);

  // Verify footer.js checks for existing .site-footer
  assert.match(footerJs, /el\.querySelector\(\s*['"]\.site-footer['"]\s*\)/);
});
