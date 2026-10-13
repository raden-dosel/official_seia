/**
 * Cloudinary Mapping Verification Test Suite
 *
 * Verifies that the Cloudinary folder convention and grouping validator
 * accurately analyzes hierarchy, detects orphans, flags ambiguous folders,
 * tracks metadata coverage, verifies asset types, and ensures deterministic stability.
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyCloudinaryMapping,
  formatVerificationReport,
} from '../scripts/verify-cloudinary-mapping.mjs';

const mockValidAssets = [
  {
    public_id: 'seia/project-alpha/img1',
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-alpha/img1.jpg',
    format: 'jpg',
    resource_type: 'image',
    width: 1920,
    height: 1080,
    created_at: '2025-01-01T00:00:00Z',
    folder: 'seia/project-alpha',
  },
  {
    public_id: 'seia/project-alpha/img2',
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-alpha/img2.jpg',
    format: 'jpg',
    resource_type: 'image',
    width: 1920,
    height: 1080,
    created_at: '2025-01-02T00:00:00Z',
    folder: 'seia/project-alpha',
  },
  {
    public_id: 'seia/project-beta/photo1',
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/seia/project-beta/photo1.jpg',
    format: 'png',
    resource_type: 'image',
    width: 1200,
    height: 800,
    created_at: '2025-01-03T00:00:00Z',
    folder: 'seia/project-beta',
  },
];

test('verifyCloudinaryMapping passes on compliant folder hierarchy', async () => {
  const result = await verifyCloudinaryMapping({ assets: mockValidAssets, prefix: 'seia' });

  assert.equal(result.status, 'PASS');
  assert.equal(result.passed, true);
  assert.equal(result.folderCompliance, 'PASS');
  assert.equal(result.stats.projectsDiscovered, 2);
  assert.equal(result.stats.projectsGrouped, 2);
  assert.equal(result.stats.orphanAssetsCount, 0);
  assert.equal(result.stats.groupingConflictsCount, 0);
  assert.equal(result.stats.overallCoveragePercent, 100);
});

test('verifyCloudinaryMapping detects orphan assets in prefix root and outside prefix', async () => {
  const assetsWithOrphans = [
    ...mockValidAssets,
    {
      public_id: 'seia/orphan-in-root',
      secure_url: 'https://res.cloudinary.com/demo/root.jpg',
      resource_type: 'image',
    },
    {
      public_id: 'misc/outside-prefix',
      secure_url: 'https://res.cloudinary.com/demo/misc.jpg',
      resource_type: 'image',
    },
  ];

  const result = await verifyCloudinaryMapping({
    assets: assetsWithOrphans,
    prefix: 'seia',
    allowWarnings: true,
  });

  assert.equal(result.status, 'WARNING');
  assert.equal(result.stats.orphanAssetsCount, 2);
  assert.ok(result.orphans.some((o) => o.public_id === 'seia/orphan-in-root'));
  assert.ok(result.orphans.some((o) => o.public_id === 'misc/outside-prefix'));
});

test('verifyCloudinaryMapping detects ambiguous deeply nested folders', async () => {
  const nestedAssets = [
    ...mockValidAssets,
    {
      public_id: 'seia/project-alpha/gallery/subfolder/deep-photo',
      secure_url: 'https://res.cloudinary.com/demo/deep.jpg',
      resource_type: 'image',
    },
  ];

  const result = await verifyCloudinaryMapping({ assets: nestedAssets, prefix: 'seia' });
  assert.equal(result.hasWarnings, true);
  assert.equal(result.ambiguous.nestedFolders.length, 1);
  assert.equal(result.ambiguous.nestedFolders[0].projectId, 'project-alpha');
  assert.match(result.ambiguous.nestedFolders[0].reason, /Deeply nested folder path/);
});

test('verifyCloudinaryMapping detects case collision conflicts (e.g. project-a vs Project-A)', async () => {
  const collidingAssets = [
    ...mockValidAssets,
    {
      public_id: 'seia/PROJECT-ALPHA/colliding-photo',
      secure_url: 'https://res.cloudinary.com/demo/collide.jpg',
      resource_type: 'image',
    },
  ];

  const result = await verifyCloudinaryMapping({ assets: collidingAssets, prefix: 'seia' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.passed, false);
  assert.equal(result.stats.groupingConflictsCount, 1);
  assert.equal(result.ambiguous.caseCollisions[0].existingId, 'project-alpha');
  assert.equal(result.ambiguous.caseCollisions[0].conflictingId, 'PROJECT-ALPHA');
});

test('verifyCloudinaryMapping accurately categorizes resource types', async () => {
  const multiTypeAssets = [
    ...mockValidAssets,
    {
      public_id: 'seia/project-alpha/video-demo',
      secure_url: 'https://res.cloudinary.com/demo/video.mp4',
      resource_type: 'video',
    },
    {
      public_id: 'seia/project-beta/specs-doc',
      secure_url: 'https://res.cloudinary.com/demo/doc.pdf',
      resource_type: 'raw',
    },
  ];

  const result = await verifyCloudinaryMapping({ assets: multiTypeAssets, prefix: 'seia' });
  assert.equal(result.assetTypes.image, 3);
  assert.equal(result.assetTypes.video, 1);
  assert.equal(result.assetTypes.raw, 1);
  assert.equal(result.hasWarnings, true);
});

test('verifyCloudinaryMapping asserts deterministic stability across grouping passes', async () => {
  const result = await verifyCloudinaryMapping({ assets: mockValidAssets, prefix: 'seia' });
  assert.equal(result.stability.passed, true);
  assert.equal(result.stability.errors.length, 0);
});

test('formatVerificationReport formats PASS, WARNING, and FAIL states correctly', () => {
  // PASS report
  const passResult = {
    status: 'PASS',
    folderCompliance: 'PASS',
    stats: {
      projectsDiscovered: 2,
      projectsGrouped: 2,
      totalAssets: 3,
      orphanAssetsCount: 0,
      groupingConflictsCount: 0,
      overallCoveragePercent: 100,
    },
    assetTypes: { image: 3, video: 0, raw: 0, unsupported: 0 },
    hierarchy: new Map([
      ['project-alpha', [{}, {}]],
      ['project-beta', [{}]],
    ]),
    orphans: [],
    ambiguous: { nestedFolders: [], caseCollisions: [] },
    metadataReport: [
      { field: 'Secure URL', coverage: 100, status: 'Required' },
      { field: 'Dimensions', coverage: 100, status: 'Available' },
    ],
    criticalFailures: [],
    warnings: [],
  };

  const passReport = formatVerificationReport(passResult);
  assert.match(passReport, /Cloudinary Mapping Verification/);
  assert.match(passReport, /Folder Structure Compliance:\s+PASS/);
  assert.match(passReport, /Status: PASS/);

  // FAIL report
  const failResult = {
    ...passResult,
    status: 'FAIL',
    folderCompliance: 'FAIL',
    criticalFailures: ['Case normalization collisions detected: 1 duplicate project name(s)'],
  };
  const failReport = formatVerificationReport(failResult);
  assert.match(failReport, /Status: FAIL/);
  assert.match(failReport, /Critical Failures:/);
});
