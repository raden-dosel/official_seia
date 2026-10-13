/**
 * Dedicated Synchronization Validation Test Suite
 *
 * Verifies that the Cloudinary synchronization workflow enforces:
 * - Asset discovery completeness & pagination
 * - Project mapping & explicit asset disposition
 * - Collection health & coverage
 * - Manual metadata preservation
 * - Duplicate detection & resolution
 * - Deterministic idempotency
 * - Robust error handling (missing credentials, API errors, loop detection)
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEnvironment,
  fetchCloudinaryAssets,
  groupAssetsByProject,
  detectUnexpectedDataLoss,
  mergePortfolioData,
  writeDatasetSafely,
  runSync,
} from '../scripts/sync-cloudinary-portfolio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseCuratedProjects = [
  {
    id: 'project-manila-01',
    title: 'Manila Commercial Fence',
    desc: 'High-security perimeter installation with solar backup.',
    category: 'Electric Fence',
    project: 'fence',
    date: '2025',
    loc: 'metro',
    tags: ['Electric Fence', 'Metro Manila', 'Solar'],
    thumbUrl: 'images/manila/thumb.jpg',
    images: [{ src: 'images/manila/img1.jpg', alt: 'Initial photo' }],
  },
  {
    id: 'project-cebu-02',
    title: 'Cebu Industrial Security',
    desc: 'Industrial perimeter fence installation.',
    category: 'Electric Fence',
    project: 'fence',
    date: '2024',
    loc: 'prov',
    tags: ['Electric Fence', 'Provincial'],
    thumbUrl: 'images/cebu/thumb.jpg',
    images: [{ src: 'images/cebu/img1.jpg', alt: 'Cebu photo' }],
  },
];

// --- 1. Asset Discovery Tests ---

test('Asset Discovery: retrieves and stitches multiple pages via next_cursor', async () => {
  let requestedPages = 0;
  const mockFetch = async () => {
    requestedPages++;
    if (requestedPages === 1) {
      return {
        ok: true,
        json: async () => ({
          resources: [
            { public_id: 'seia/project-manila-01/asset-01', secure_url: 'https://res.cloudinary.com/demo/1.jpg' },
          ],
          next_cursor: 'page-2-token',
        }),
      };
    } else {
      return {
        ok: true,
        json: async () => ({
          resources: [
            { public_id: 'seia/project-manila-01/asset-02', secure_url: 'https://res.cloudinary.com/demo/2.jpg' },
          ],
          next_cursor: null,
        }),
      };
    }
  };

  const assets = await fetchCloudinaryAssets(
    { cloudName: 'demo-cloud', apiKey: 'test-key', apiSecret: 'test-secret' },
    mockFetch
  );

  assert.equal(assets.length, 2);
  assert.equal(assets.discoveryStats.pagesRetrieved, 2);
  assert.equal(assets.discoveryStats.validUniqueAssets, 2);
  assert.equal(assets.discoveryStats.duplicateAssets, 0);
});

test('Asset Discovery: detects and rejects infinite pagination loop', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      resources: [{ public_id: 'seia/project-manila-01/asset-01', secure_url: 'https://res.cloudinary.com/demo/1.jpg' }],
      next_cursor: 'looping-cursor-token',
    }),
  });

  await assert.rejects(
    () => fetchCloudinaryAssets({ cloudName: 'demo-cloud', apiKey: 'test-key', apiSecret: 'test-secret' }, mockFetch),
    /Pagination loop detected.*looping-cursor-token/
  );
});

// --- 2. Project Mapping & Accounting Tests ---

test('Project Mapping: assigns assets to correct projects and reports unmatched folders as pending', () => {
  const discoveredAssets = [
    { public_id: 'seia/project-manila-01/photo-1', secure_url: 'https://res.cloudinary.com/demo/m1.jpg' },
    { public_id: 'seia/project-unlisted-99/photo-1', secure_url: 'https://res.cloudinary.com/demo/u1.jpg' },
    { public_id: 'seia/standalone-photo', secure_url: 'https://res.cloudinary.com/demo/s1.jpg' },
  ];

  const projectMap = groupAssetsByProject(discoveredAssets, 'seia');
  assert.equal(projectMap.accounting.eligible, 2);
  assert.equal(projectMap.accounting.excluded.length, 1);
  assert.match(projectMap.accounting.excluded[0].reason, /without project subfolder/);

  const { updatedItems, stats, accounting } = mergePortfolioData(baseCuratedProjects, projectMap);

  // Manila matched
  assert.equal(stats.matchedProjects, 1);
  assert.equal(updatedItems[0].id, 'project-manila-01');
  assert.equal(updatedItems[0].images[0].src, 'https://res.cloudinary.com/demo/m1.jpg');

  // Unlisted folder classified as pending
  assert.equal(stats.newProjectsPending, 1);
  assert.equal(stats.unmatchedAssets, 1);
  assert.equal(accounting.pendingAssets.length, 1);
  assert.equal(accounting.pendingAssets[0].projectId, 'project-unlisted-99');
  assert.equal(accounting.pendingAssets[0].disposition, 'PENDING_UNMATCHED');
});

// --- 3. Collection Health & Data Loss Tests ---

test('Collection Health: unexpected loss of previously published Cloudinary images fails validation', () => {
  const publishedProject = {
    ...baseCuratedProjects[0],
    thumbUrl: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-manila-01/img1.jpg',
    images: [
      { src: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-manila-01/img1.jpg', alt: 'P1' },
      { src: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-manila-01/img2.jpg', alt: 'P2' },
    ],
  };

  // Discovery only returned img1, img2 was lost!
  const partialDiscovered = [
    { public_id: 'seia/project-manila-01/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' },
  ];
  const projectMap = groupAssetsByProject(partialDiscovered, 'seia');

  assert.throws(
    () => detectUnexpectedDataLoss([publishedProject], partialDiscovered, projectMap),
    /Unexpected data loss detected: 1 previously published Cloudinary asset\(s\) missing/
  );
});

// --- 4. Metadata Preservation Tests ---

test('Metadata Preservation: synchronization does not destroy manually curated fields', () => {
  const projectMap = new Map();
  projectMap.set('project-manila-01', [
    { public_id: 'seia/project-manila-01/new-photo', secure_url: 'https://res.cloudinary.com/demo/new.jpg' },
  ]);

  const { updatedItems } = mergePortfolioData(baseCuratedProjects, projectMap);
  const updatedManila = updatedItems.find((p) => p.id === 'project-manila-01');

  // Media updated
  assert.equal(updatedManila.thumbUrl, 'https://res.cloudinary.com/demo/new.jpg');
  assert.equal(updatedManila.images[0].src, 'https://res.cloudinary.com/demo/new.jpg');

  // Curated metadata preserved exactly
  assert.equal(updatedManila.title, 'Manila Commercial Fence');
  assert.equal(updatedManila.desc, 'High-security perimeter installation with solar backup.');
  assert.equal(updatedManila.category, 'Electric Fence');
  assert.equal(updatedManila.project, 'fence');
  assert.equal(updatedManila.date, '2025');
  assert.equal(updatedManila.loc, 'metro');
  assert.deepEqual(updatedManila.tags, ['Electric Fence', 'Metro Manila', 'Solar']);
});

// --- 5. Idempotency Tests ---

test('Idempotency: consecutive runs produce identical datasets and zero unnecessary updates', async () => {
  const tempFile = path.join(__dirname, 'test-idempotent-sync.json');
  fs.writeFileSync(tempFile, JSON.stringify(baseCuratedProjects, null, 2), 'utf8');

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      resources: [
        { public_id: 'seia/project-manila-01/img1', secure_url: 'https://res.cloudinary.com/demo/m1.jpg' },
      ],
      next_cursor: null,
    }),
  });

  const env = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };

  try {
    // Run 1: updates project-manila-01
    const run1 = await runSync({ dataPath: tempFile, env, fetchFn: mockFetch });
    assert.equal(run1.stats.updatedProjects, 1);
    const content1 = fs.readFileSync(tempFile, 'utf8');

    // Run 2: identical input -> 0 updates, identical JSON
    const run2 = await runSync({ dataPath: tempFile, env, fetchFn: mockFetch });
    assert.equal(run2.stats.updatedProjects, 0);
    assert.equal(run2.stats.unchangedProjects, 2);
    const content2 = fs.readFileSync(tempFile, 'utf8');

    assert.equal(content1, content2);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// --- 6. Error Handling Tests ---

test('Error Handling: missing credentials fails with non-zero exit code', () => {
  assert.throws(
    () => validateEnvironment({ CLOUDINARY_CLOUD_NAME: '' }),
    /Missing required Cloudinary environment variables/
  );
});

test('Error Handling: malformed API response halts synchronization safely', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => 'Not a JSON object with resources',
  });

  await assert.rejects(
    () => fetchCloudinaryAssets({ cloudName: 'test', apiKey: 'k', apiSecret: 's' }, mockFetch),
    /expected resources array/
  );
});

test('Error Handling: mid-stream network failure preserves last-known-good dataset', async () => {
  const tempFile = path.join(__dirname, 'test-network-failure.json');
  fs.writeFileSync(tempFile, JSON.stringify(baseCuratedProjects, null, 2), 'utf8');
  const originalContent = fs.readFileSync(tempFile, 'utf8');

  const mockFailingFetch = async () => {
    throw new Error('ETIMEDOUT: Connection reset by peer');
  };

  await assert.rejects(
    () =>
      runSync({
        dataPath: tempFile,
        env: { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' },
        fetchFn: mockFailingFetch,
      }),
    /Cloudinary API network failure on page 1: ETIMEDOUT/
  );

  // Verify file was NOT modified or corrupted
  const contentAfterFailure = fs.readFileSync(tempFile, 'utf8');
  assert.equal(contentAfterFailure, originalContent);

  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
});
