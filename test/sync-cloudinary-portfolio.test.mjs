/**
 * Comprehensive automated test suite for Cloudinary-to-Portfolio synchronization utility
 * Tests discovery, pagination, asset accounting, project mapping, data loss detection,
 * schema validation, atomic writing, error recovery, and idempotency.
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
  createAuthHeader,
  extractCloudinaryPublicId,
  fetchCloudinaryAssets,
  groupAssetsByProject,
  detectUnexpectedDataLoss,
  mergePortfolioData,
  validatePortfolioData,
  writeDatasetSafely,
  runSync,
} from '../scripts/sync-cloudinary-portfolio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleExisting = [
  {
    id: 'project-alpha',
    title: 'Alpha Electric Fence',
    project: 'fence',
    date: '2025',
    loc: 'metro',
    tags: ['Electric Fence', 'Metro Manila'],
    desc: 'Manually curated description for Alpha project.',
    thumbUrl: 'images/alpha/thumb.jpg',
    category: 'Electric Fence',
    images: [
      { src: 'images/alpha/img1.jpg', alt: 'Existing curated alt 1' },
      { src: 'images/alpha/img2.jpg', alt: 'Existing curated alt 2' },
    ],
  },
  {
    id: 'project-beta',
    title: 'Beta Provincial Security',
    project: 'fence',
    date: '2024',
    loc: 'prov',
    tags: ['Electric Fence', 'Provincial'],
    desc: 'Curated description for Beta project.',
    thumbUrl: 'images/beta/thumb.jpg',
    category: 'Electric Fence',
    images: [{ src: 'images/beta/img1.jpg', alt: 'Beta image 1' }],
  },
];

const sampleWithCloudinary = [
  {
    id: 'project-cloud',
    title: 'Cloud Security Fence',
    project: 'fence',
    date: '2026',
    loc: 'metro',
    tags: ['Electric Fence'],
    desc: 'Cloud-backed project description.',
    thumbUrl: 'https://res.cloudinary.com/demo/image/upload/v12345/seia/project-cloud/img1.jpg',
    category: 'Electric Fence',
    images: [
      {
        src: 'https://res.cloudinary.com/demo/image/upload/v12345/seia/project-cloud/img1.jpg',
        alt: 'Cloud Image 1',
      },
      {
        src: 'https://res.cloudinary.com/demo/image/upload/v12345/seia/project-cloud/img2.jpg',
        alt: 'Cloud Image 2',
      },
    ],
  },
  ...sampleExisting,
];

// --- Credential and Auth Tests ---

test('validateEnvironment throws descriptive error when credentials missing', () => {
  assert.throws(
    () => validateEnvironment({}),
    /Missing required Cloudinary environment variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/
  );

  assert.throws(
    () => validateEnvironment({ CLOUDINARY_CLOUD_NAME: 'test_cloud' }),
    /Missing required Cloudinary environment variables: CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/
  );
});

test('validateEnvironment returns sanitized credentials when present', () => {
  const result = validateEnvironment({
    CLOUDINARY_CLOUD_NAME: ' my_cloud ',
    CLOUDINARY_API_KEY: ' 12345 ',
    CLOUDINARY_API_SECRET: ' secret99 ',
  });

  assert.equal(result.cloudName, 'my_cloud');
  assert.equal(result.apiKey, '12345');
  assert.equal(result.apiSecret, 'secret99');
});

test('createAuthHeader produces valid Basic base64 string', () => {
  const header = createAuthHeader('key123', 'secretABC');
  assert.equal(header, `Basic ${Buffer.from('key123:secretABC').toString('base64')}`);
});

test('extractCloudinaryPublicId accurately parses public ID from delivery URL', () => {
  const url1 = 'https://res.cloudinary.com/demo/image/upload/v12345/seia/project-cloud/img1.jpg';
  assert.equal(extractCloudinaryPublicId(url1), 'seia/project-cloud/img1');

  const urlEncoded = 'https://res.cloudinary.com/demo/image/upload/v1788641164/seia/J.Molina%20street%20marikina%20city082826/ed1vdppv6oubiudjvyjb.jpg';
  assert.equal(extractCloudinaryPublicId(urlEncoded), 'seia/J.Molina street marikina city082826/ed1vdppv6oubiudjvyjb');

  assert.equal(extractCloudinaryPublicId('images/local/photo.jpg'), null);
});

// --- Discovery & Pagination Completeness Tests ---

test('fetchCloudinaryAssets handles single-page and multi-page pagination', async () => {
  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          resources: [
            {
              public_id: 'seia/project-alpha/img1',
              secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-alpha/img1.jpg',
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
          next_cursor: 'cursor_page_2',
        }),
      };
    } else {
      return {
        ok: true,
        json: async () => ({
          resources: [
            {
              public_id: 'seia/project-alpha/img2',
              secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-alpha/img2.jpg',
              created_at: '2025-01-02T00:00:00Z',
            },
          ],
          next_cursor: null,
        }),
      };
    }
  };

  const assets = await fetchCloudinaryAssets(
    { cloudName: 'demo', apiKey: 'k', apiSecret: 's' },
    mockFetch
  );

  assert.equal(assets.length, 2);
  assert.equal(callCount, 2);
  assert.equal(assets.discoveryStats.pagesRetrieved, 2);
  assert.equal(assets.discoveryStats.validUniqueAssets, 2);
  assert.equal(assets[0].public_id, 'seia/project-alpha/img1');
  assert.equal(assets[1].public_id, 'seia/project-alpha/img2');
});

test('fetchCloudinaryAssets fails safely on later page failure', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          resources: [{ public_id: 'seia/p1/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' }],
          next_cursor: 'cursor_p2',
        }),
      };
    } else {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Cloudinary server timeout' } }),
      };
    }
  };

  await assert.rejects(
    () => fetchCloudinaryAssets({ cloudName: 'demo', apiKey: 'k', apiSecret: 's' }, mockFetch),
    /Cloudinary API request failed on page 2 with status 500: Cloudinary server timeout/
  );
});

test('fetchCloudinaryAssets detects and halts on pagination loop', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      resources: [{ public_id: 'seia/p1/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' }],
      next_cursor: 'same_repeating_cursor',
    }),
  });

  await assert.rejects(
    () => fetchCloudinaryAssets({ cloudName: 'demo', apiKey: 'k', apiSecret: 's' }, mockFetch),
    /Pagination loop detected: Cloudinary Admin API returned repeating cursor "same_repeating_cursor"/
  );
});

test('fetchCloudinaryAssets rejects malformed response without resources array', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ unexpected_field: true }),
  });

  await assert.rejects(
    () => fetchCloudinaryAssets({ cloudName: 'demo', apiKey: 'k', apiSecret: 's' }, mockFetch),
    /Malformed Cloudinary API response on page 1: expected resources array/
  );
});

test('fetchCloudinaryAssets deduplicates assets by public_id', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      resources: [
        { public_id: 'seia/p1/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' },
        { public_id: 'seia/p1/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' }, // Duplicate
      ],
      next_cursor: null,
    }),
  });

  const assets = await fetchCloudinaryAssets(
    { cloudName: 'demo', apiKey: 'k', apiSecret: 's' },
    mockFetch
  );

  assert.equal(assets.length, 1);
  assert.equal(assets.discoveryStats.duplicateAssets, 1);
});

// --- Asset Accounting & Project Mapping Tests ---

test('groupAssetsByProject groups assets and classifies standalone assets as excluded', () => {
  const rawAssets = [
    {
      public_id: 'seia/project-alpha/photo-b',
      secure_url: 'https://res.cloudinary.com/demo/b.jpg',
      created_at: '2025-02-01T00:00:00Z',
    },
    {
      public_id: 'seia/project-alpha/photo-a',
      secure_url: 'https://res.cloudinary.com/demo/a.jpg',
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      public_id: 'seia/root-standalone-photo',
      secure_url: 'https://res.cloudinary.com/demo/alone.jpg',
      created_at: '2025-01-01T00:00:00Z',
    },
  ];

  const grouped = groupAssetsByProject(rawAssets, 'seia');
  assert.equal(grouped.size, 1);
  assert.ok(grouped.has('project-alpha'));

  const alphaImages = grouped.get('project-alpha');
  assert.equal(alphaImages.length, 2);
  // Checked sorting: photo-a is older than photo-b
  assert.equal(alphaImages[0].public_id, 'seia/project-alpha/photo-a');
  assert.equal(alphaImages[1].public_id, 'seia/project-alpha/photo-b');

  // Verify accounting disposition for standalone asset
  assert.equal(grouped.accounting.eligible, 2);
  assert.equal(grouped.accounting.excluded.length, 1);
  assert.equal(grouped.accounting.excluded[0].public_id, 'seia/root-standalone-photo');
  assert.match(grouped.accounting.excluded[0].reason, /without project subfolder/);
});

// --- Data Loss Detection Tests ---

test('detectUnexpectedDataLoss passes when all published Cloudinary assets are discovered', () => {
  const discovered = [
    { public_id: 'seia/project-cloud/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' },
    { public_id: 'seia/project-cloud/img2', secure_url: 'https://res.cloudinary.com/demo/img2.jpg' },
  ];
  const projectMap = groupAssetsByProject(discovered, 'seia');

  const check = detectUnexpectedDataLoss(sampleWithCloudinary, discovered, projectMap);
  assert.equal(check.projectsWithCloudinaryCount, 1);
  assert.equal(check.verifiedPublishedImagesCount, 2);
});

test('detectUnexpectedDataLoss throws error when previously published Cloudinary asset is missing', () => {
  // Only img1 is discovered; img2 is unexpectedly missing!
  const discovered = [
    { public_id: 'seia/project-cloud/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' },
  ];
  const projectMap = groupAssetsByProject(discovered, 'seia');

  assert.throws(
    () => detectUnexpectedDataLoss(sampleWithCloudinary, discovered, projectMap),
    /Unexpected data loss detected: 1 previously published Cloudinary asset\(s\) missing from discovery/
  );
});

test('detectUnexpectedDataLoss throws error when Cloudinary returns 0 assets but Cloudinary assets are published', () => {
  const discovered = [];
  const projectMap = new Map();

  assert.throws(
    () => detectUnexpectedDataLoss(sampleWithCloudinary, discovered, projectMap),
    /Data freshness failure: Cloudinary discovery returned 0 assets, but 1 project\(s\) with 2 previously published Cloudinary images require synchronization/
  );
});

// --- Merge & Dataset Schema Integrity Tests ---

test('mergePortfolioData preserves manual fields and tracks pending uncurated folders', () => {
  const assetMap = new Map();
  assetMap.set('project-alpha', [
    { public_id: 'seia/project-alpha/img1', secure_url: 'https://res.cloudinary.com/demo/a1.jpg' },
  ]);
  // project-new is in Cloudinary but NOT yet in portfolio-data.json
  assetMap.set('project-new', [
    { public_id: 'seia/project-new/img1', secure_url: 'https://res.cloudinary.com/demo/new1.jpg' },
  ]);

  const { updatedItems, stats, accounting } = mergePortfolioData(sampleExisting, assetMap);

  assert.equal(updatedItems.length, 2);
  assert.equal(stats.matchedProjects, 1);
  assert.equal(stats.newProjectsPending, 1);
  assert.equal(stats.unmatchedAssets, 1);

  // Alpha item was updated while preserving description and tags
  assert.equal(updatedItems[0].id, 'project-alpha');
  assert.equal(updatedItems[0].desc, 'Manually curated description for Alpha project.');
  assert.equal(updatedItems[0].thumbUrl, 'https://res.cloudinary.com/demo/a1.jpg');

  // Verify explicit accounting for pending asset
  assert.equal(accounting.pendingAssets.length, 1);
  assert.equal(accounting.pendingAssets[0].disposition, 'PENDING_UNMATCHED');
  assert.equal(accounting.pendingAssets[0].projectId, 'project-new');
});

test('validatePortfolioData passes on valid data and fails on bad data or project decrease', () => {
  assert.ok(validatePortfolioData(sampleExisting));

  // Throws on empty array to prevent data deletion
  assert.throws(() => validatePortfolioData([]), /aborting to prevent catastrophic data loss/);

  // Throws on duplicate IDs
  assert.throws(
    () =>
      validatePortfolioData([
        { id: 'dup', title: 'A', thumbUrl: 'a.jpg', category: 'C', project: 'P', images: [{ src: 'a.jpg' }] },
        { id: 'dup', title: 'B', thumbUrl: 'b.jpg', category: 'C', project: 'P', images: [{ src: 'b.jpg' }] },
      ]),
    /Duplicate project ID detected: "dup"/
  );

  // Throws on insecure HTTP image URLs
  assert.throws(
    () =>
      validatePortfolioData([
        { id: 'p1', title: 'T', thumbUrl: 'a.jpg', category: 'C', project: 'P', images: [{ src: 'http://insecure.com/img.jpg' }] },
      ]),
    /must use HTTPS/
  );

  // Throws if project count decreased compared to previous dataset
  assert.throws(
    () => validatePortfolioData([sampleExisting[0]], sampleExisting),
    /Portfolio dataset project count decreased from 2 to 1; project loss detected/
  );
});

// --- File Safety & Idempotency Tests ---

test('writeDatasetSafely performs atomic write and validates parsing', () => {
  const tempTarget = path.join(__dirname, 'test-temp-output.json');
  try {
    writeDatasetSafely(tempTarget, sampleExisting);
    assert.ok(fs.existsSync(tempTarget));
    const reloaded = JSON.parse(fs.readFileSync(tempTarget, 'utf8'));
    assert.equal(reloaded.length, sampleExisting.length);
    assert.equal(reloaded[0].id, sampleExisting[0].id);
  } finally {
    if (fs.existsSync(tempTarget)) fs.unlinkSync(tempTarget);
  }
});

test('runSync preserves last-known-good dataset on failure', async () => {
  const testFile = path.join(__dirname, 'test-rollback-data.json');
  fs.writeFileSync(testFile, JSON.stringify(sampleWithCloudinary, null, 2), 'utf8');

  // Mock fetch that fails mid-sync (page 2 failure)
  let callCount = 0;
  const mockFailingFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          resources: [{ public_id: 'seia/project-cloud/img1', secure_url: 'https://res.cloudinary.com/demo/img1.jpg' }],
          next_cursor: 'cursor_2',
        }),
      };
    }
    return { ok: false, status: 503, text: async () => 'Service unavailable' };
  };

  const beforeContent = fs.readFileSync(testFile, 'utf8');

  await assert.rejects(
    () =>
      runSync({
        dataPath: testFile,
        env: {
          CLOUDINARY_CLOUD_NAME: 'test_cloud',
          CLOUDINARY_API_KEY: '123',
          CLOUDINARY_API_SECRET: 'secret',
        },
        fetchFn: mockFailingFetch,
      }),
    /Cloudinary API request failed on page 2 with status 503/
  );

  // Target file MUST remain identical to beforeContent
  const afterContent = fs.readFileSync(testFile, 'utf8');
  assert.equal(beforeContent, afterContent);
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
});

test('runSync produces identical dataset on consecutive runs (idempotency)', async () => {
  const testFile = path.join(__dirname, 'test-idempotent-data.json');
  fs.writeFileSync(testFile, JSON.stringify(sampleExisting, null, 2), 'utf8');

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      resources: [
        {
          public_id: 'seia/project-alpha/remote1',
          secure_url: 'https://res.cloudinary.com/demo/remote1.jpg',
        },
      ],
      next_cursor: null,
    }),
  });

  const env = {
    CLOUDINARY_CLOUD_NAME: 'test_cloud',
    CLOUDINARY_API_KEY: '123',
    CLOUDINARY_API_SECRET: 'secret',
  };

  try {
    // Run 1: updates project-alpha
    const run1 = await runSync({ dataPath: testFile, env, fetchFn: mockFetch });
    assert.equal(run1.stats.updatedProjects, 1);
    const contentAfterRun1 = fs.readFileSync(testFile, 'utf8');

    // Run 2: same data -> 0 updates, completely identical content
    const run2 = await runSync({ dataPath: testFile, env, fetchFn: mockFetch });
    assert.equal(run2.stats.updatedProjects, 0);
    assert.equal(run2.stats.unchangedProjects, 2);
    const contentAfterRun2 = fs.readFileSync(testFile, 'utf8');

    assert.equal(contentAfterRun1, contentAfterRun2);
  } finally {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  }
});
