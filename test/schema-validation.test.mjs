/**
 * Dedicated Portfolio Schema Validation Test Suite
 *
 * Verifies that the portfolio dataset schema is strictly enforced,
 * including required fields, types, HTTPS URLs, ID uniqueness,
 * and collection health.
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePortfolioSchema } from '../scripts/validate-portfolio-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORTFOLIO_DATA_PATH = path.join(ROOT_DIR, 'portfolio-data.json');

const validMockProject = {
  id: 'fence-mock-001',
  title: 'Mock Security Fence',
  desc: 'Professional installation for testing purposes.',
  thumbUrl: 'https://res.cloudinary.com/demo/image/upload/v1/mock/thumb.jpg',
  category: 'Electric Fence',
  project: 'fence',
  date: '2026',
  loc: 'metro',
  tags: ['Electric Fence', 'Metro Manila'],
  images: [
    { src: 'https://res.cloudinary.com/demo/image/upload/v1/mock/img1.jpg', alt: 'Image 1' },
    { src: 'https://res.cloudinary.com/demo/image/upload/v1/mock/img2.jpg', alt: 'Image 2' },
  ],
};

test('Live dataset (portfolio-data.json) satisfies all schema requirements', () => {
  assert.ok(fs.existsSync(PORTFOLIO_DATA_PATH), 'portfolio-data.json must exist');
  const raw = fs.readFileSync(PORTFOLIO_DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const result = validatePortfolioSchema(data);
  assert.equal(result.valid, true, `Validation errors found: ${result.errors.join('; ')}`);
  assert.ok(result.stats.projectCount >= 30, 'Should contain all verified portfolio projects');
  assert.ok(result.stats.imageCount >= 200, 'Should contain all verified images');
  assert.equal(result.stats.duplicateIds, 0, 'No duplicate IDs permitted');
  assert.equal(result.stats.validationErrors, 0);
});

test('Schema validator rejects non-array input', () => {
  const result = validatePortfolioSchema({ notAnArray: true });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /must be a top-level JSON Array/);
});

test('Schema validator rejects empty array', () => {
  const result = validatePortfolioSchema([]);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /cannot be empty/);
});

test('Schema validator catches missing or empty required fields', () => {
  // Missing id
  const noId = { ...validMockProject, id: '' };
  assert.equal(validatePortfolioSchema([noId]).valid, false);

  // Missing title
  const noTitle = { ...validMockProject, title: '   ' };
  assert.equal(validatePortfolioSchema([noTitle]).valid, false);

  // Missing description (both desc and description absent)
  const noDesc = { ...validMockProject };
  delete noDesc.desc;
  delete noDesc.description;
  const descRes = validatePortfolioSchema([noDesc]);
  assert.equal(descRes.valid, false);
  assert.ok(descRes.errors.some((e) => e.includes('Missing or empty "desc" / "description"')));

  // Accepts description if desc is absent
  const withDescription = { ...validMockProject, description: 'Alternative description field' };
  delete withDescription.desc;
  assert.equal(validatePortfolioSchema([withDescription]).valid, true);

  // Missing thumbUrl
  const noThumb = { ...validMockProject, thumbUrl: '' };
  assert.equal(validatePortfolioSchema([noThumb]).valid, false);

  // Missing category
  const noCategory = { ...validMockProject, category: '' };
  assert.equal(validatePortfolioSchema([noCategory]).valid, false);

  // Missing project type
  const noProject = { ...validMockProject, project: '' };
  assert.equal(validatePortfolioSchema([noProject]).valid, false);

  // Missing date or loc
  const noDate = { ...validMockProject, date: '' };
  assert.equal(validatePortfolioSchema([noDate]).valid, false);

  const noLoc = { ...validMockProject, loc: '' };
  assert.equal(validatePortfolioSchema([noLoc]).valid, false);

  // Missing tags
  const noTags = { ...validMockProject, tags: [] };
  assert.equal(validatePortfolioSchema([noTags]).valid, false);
});

test('Schema validator enforces HTTPS for remote image and thumbnail URLs', () => {
  // Insecure thumbnail
  const insecureThumb = { ...validMockProject, thumbUrl: 'http://insecure.cloudinary.com/thumb.jpg' };
  const resThumb = validatePortfolioSchema([insecureThumb]);
  assert.equal(resThumb.valid, false);
  assert.ok(resThumb.errors.some((e) => e.includes('must use HTTPS')));

  // Insecure gallery image
  const insecureImg = {
    ...validMockProject,
    images: [{ src: 'http://insecure.example.com/img.jpg', alt: 'Insecure photo' }],
  };
  const resImg = validatePortfolioSchema([insecureImg]);
  assert.equal(resImg.valid, false);
  assert.ok(resImg.errors.some((e) => e.includes('Insecure HTTP URL prohibited')));
});

test('Schema validator rejects duplicate project IDs', () => {
  const p1 = { ...validMockProject, id: 'duplicate-id-123' };
  const p2 = { ...validMockProject, id: 'duplicate-id-123', title: 'Second Project' };

  const result = validatePortfolioSchema([p1, p2]);
  assert.equal(result.valid, false);
  assert.equal(result.stats.duplicateIds, 1);
  assert.ok(result.errors.some((e) => e.includes('Duplicate project ID detected: "duplicate-id-123"')));
});

test('Schema validator rejects empty images array or images missing alt text', () => {
  const emptyImages = { ...validMockProject, images: [] };
  const resEmpty = validatePortfolioSchema([emptyImages]);
  assert.equal(resEmpty.valid, false);
  assert.ok(resEmpty.errors.some((e) => e.includes('Must have a non-empty "images" array')));

  const missingAlt = {
    ...validMockProject,
    images: [{ src: 'https://res.cloudinary.com/demo/image.jpg', alt: '' }],
  };
  const resAlt = validatePortfolioSchema([missingAlt]);
  assert.equal(resAlt.valid, false);
  assert.ok(resAlt.errors.some((e) => e.includes('Missing or empty "alt" text')));
});

test('Schema validator rejects duplicate image URLs within a project', () => {
  const dupImages = {
    ...validMockProject,
    images: [
      { src: 'https://res.cloudinary.com/demo/image1.jpg', alt: 'Photo 1' },
      { src: 'https://res.cloudinary.com/demo/image1.jpg', alt: 'Photo 2 (duplicate src)' },
    ],
  };
  const result = validatePortfolioSchema([dupImages]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Duplicate image reference')));
});

test('Schema validator detects unexpected project count reductions', () => {
  const previous = [validMockProject, { ...validMockProject, id: 'proj-2' }];
  const current = [validMockProject]; // Decreased from 2 to 1

  const result = validatePortfolioSchema(current, { previousData: previous });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('project count decreased unexpectedly')));
});
