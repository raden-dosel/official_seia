/**
 * Portfolio Fallback Consistency Test Suite
 *
 * Verifies that drift detection between the JSON portfolio dataset
 * and static HTML fallback cards functions deterministically in both
 * strict and relaxed modes.
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractHtmlFallbackProjects,
  compareFallbackConsistency,
  formatConsistencyReport,
  DEFAULT_HTML_PATH,
  DEFAULT_JSON_PATH,
} from '../scripts/validate-fallback-consistency.mjs';

const mockJsonData = [
  {
    id: 'project-manila',
    title: 'Manila Security Fence',
    category: 'Electric Fence',
    project: 'fence',
    thumbUrl: 'images/project-manila/img1.jpg',
  },
  {
    id: 'project-cebu',
    title: 'Cebu Commercial Perimeter',
    category: 'Electric Fence',
    project: 'fence',
    thumbUrl: 'images/project-cebu/img1.jpg',
  },
  {
    id: 'project-davao',
    title: 'Davao Residential Fence',
    category: 'Electric Fence',
    project: 'fence',
    thumbUrl: 'images/project-davao/img1.jpg',
  },
];

const mockHtmlMarkup = `
<section id="portfolio" class="portfolio">
  <div class="portfolio__grid">
    <article class="pf-card" data-id="project-manila" data-title="Manila Security Fence" data-project="fence">
      <div class="pf-card__media">
        <img class="pf-card__img" src="images/project-manila/img1.jpg" alt="Manila installation" />
      </div>
      <div class="pf-card__content">
        <h3 class="pf-card__title">Manila Security Fence</h3>
      </div>
    </article>
    <article class="pf-card" data-title="Cebu Commercial Perimeter">
      <div class="pf-card__media">
        <img class="pf-card__img" src="images/project-cebu/thumb.jpg" alt="Cebu installation" />
      </div>
      <div class="pf-card__content">
        <h3 class="pf-card__title">Cebu Commercial Perimeter</h3>
      </div>
    </article>
  </div>
</section>
`;

test('extractHtmlFallbackProjects extracts cards with explicit data-id and derived thumb ID', () => {
  const cards = extractHtmlFallbackProjects(mockHtmlMarkup);
  assert.equal(cards.length, 2);

  // Card 1 has explicit data-id
  assert.equal(cards[0].id, 'project-manila');
  assert.equal(cards[0].title, 'Manila Security Fence');
  assert.equal(cards[0].hasExplicitId, true);

  // Card 2 derives ID from images/project-cebu/ folder
  assert.equal(cards[1].id, 'project-cebu');
  assert.equal(cards[1].title, 'Cebu Commercial Perimeter');
  assert.equal(cards[1].hasExplicitId, false);
});

test('compareFallbackConsistency passes in relaxed mode when HTML is a valid subset of JSON', () => {
  const cards = extractHtmlFallbackProjects(mockHtmlMarkup);
  const result = compareFallbackConsistency(mockJsonData, cards, { mode: 'relaxed' });

  assert.equal(result.passed, true);
  assert.equal(result.stats.missingInJsonCount, 0);
  assert.equal(result.stats.titleDifferencesCount, 0);
  assert.equal(result.stats.duplicateJsonIdsCount, 0);
});

test('compareFallbackConsistency fails in strict mode when JSON projects are missing in HTML', () => {
  const cards = extractHtmlFallbackProjects(mockHtmlMarkup);
  // mockHtmlMarkup only has 2 of 3 projects
  const result = compareFallbackConsistency(mockJsonData, cards, { mode: 'strict' });

  assert.equal(result.passed, false);
  assert.equal(result.stats.missingInHtmlCount, 1);
  assert.equal(result.missingInHtml[0].id, 'project-davao');
});

test('compareFallbackConsistency detects project missing in JSON', () => {
  const htmlWithGhost = `
    <article class="pf-card" data-id="ghost-project" data-title="Ghost Project">
      <div class="pf-card__media"><img src="images/ghost-project/img.jpg" /></div>
      <h3 class="pf-card__title">Ghost Project</h3>
    </article>
  `;
  const cards = extractHtmlFallbackProjects(htmlWithGhost);
  const result = compareFallbackConsistency(mockJsonData, cards, { mode: 'relaxed' });

  assert.equal(result.passed, false);
  assert.equal(result.stats.missingInJsonCount, 1);
  assert.equal(result.missingInJson[0].id, 'ghost-project');
});

test('compareFallbackConsistency detects title drift between JSON and HTML', () => {
  const htmlDrift = `
    <article class="pf-card" data-id="project-manila" data-title="Old Outdated Manila Name">
      <div class="pf-card__media"><img src="images/project-manila/img.jpg" /></div>
      <h3 class="pf-card__title">Old Outdated Manila Name</h3>
    </article>
  `;
  const cards = extractHtmlFallbackProjects(htmlDrift);
  const result = compareFallbackConsistency(mockJsonData, cards, { mode: 'relaxed' });

  assert.equal(result.passed, false);
  assert.equal(result.stats.titleDifferencesCount, 1);
  assert.equal(result.titleDifferences[0].id, 'project-manila');
  assert.equal(result.titleDifferences[0].htmlTitle, 'Old Outdated Manila Name');
  assert.equal(result.titleDifferences[0].jsonTitle, 'Manila Security Fence');
});

test('compareFallbackConsistency detects duplicate IDs in HTML or JSON', () => {
  const htmlDuplicate = `
    <article class="pf-card" data-id="dup-1"><h3 class="pf-card__title">Card 1</h3></article>
    <article class="pf-card" data-id="dup-1"><h3 class="pf-card__title">Card 2</h3></article>
  `;
  const cards = extractHtmlFallbackProjects(htmlDuplicate);
  const result = compareFallbackConsistency(mockJsonData, cards, { mode: 'relaxed' });

  assert.equal(result.passed, false);
  assert.equal(result.stats.duplicateHtmlIdsCount, 1);
});

test('formatConsistencyReport outputs standard human-readable format', () => {
  const mockResult = {
    passed: true,
    mode: 'relaxed',
    stats: {
      jsonCount: 28,
      htmlCount: 28,
      missingInHtmlCount: 0,
      missingInJsonCount: 0,
      duplicateJsonIdsCount: 0,
      titleDifferencesCount: 0,
    },
    missingInHtml: [],
    missingInJson: [],
    duplicateJsonIds: [],
    duplicateHtmlIds: [],
    titleDifferences: [],
  };

  const report = formatConsistencyReport(mockResult);
  assert.match(report, /Portfolio Fallback Consistency Report/);
  assert.match(report, /JSON Projects:\n28/);
  assert.match(report, /HTML Projects:\n28/);
  assert.match(report, /Missing In HTML:\n0/);
  assert.match(report, /Missing In JSON:\n0/);
  assert.match(report, /Status:\nPASSED/);
});

test('Real repository fallback audit detects known drift in portfolio.html', () => {
  const rawHtml = fs.readFileSync(DEFAULT_HTML_PATH, 'utf8');
  const rawJson = fs.readFileSync(DEFAULT_JSON_PATH, 'utf8');

  const cards = extractHtmlFallbackProjects(rawHtml);
  const json = JSON.parse(rawJson);

  assert.equal(cards.length, 4, 'portfolio.html currently contains 4 fallback cards');

  // Real scan: detects that bag-bag-novaliches-qc-(4-lines) is missing in JSON
  const result = compareFallbackConsistency(json, cards, { mode: 'relaxed' });
  assert.equal(result.passed, false, 'Should catch the missing in JSON drift');
  assert.equal(result.stats.missingInJsonCount, 1);
  assert.equal(result.missingInJson[0].id, 'bag-bag-novaliches-qc-(4-lines)');

  // With ignore flag, the remaining 3 verified cards pass cleanly
  const ignoredResult = compareFallbackConsistency(json, cards, {
    mode: 'relaxed',
    ignoreIds: ['bag-bag-novaliches-qc-(4-lines)'],
  });
  assert.equal(ignoredResult.passed, true);
  assert.equal(ignoredResult.stats.missingInJsonCount, 0);
});
