/**
 * Cloudinary Project Metadata Scaffolding Test Suite
 *
 * Validates discovery, pending folder identification, title formatting,
 * category determination, schema conformity, review flagging, draft isolation,
 * idempotency, manual edits preservation, and security boundaries.
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatDraftTitle,
  determineCategory,
  inferDateAndLocation,
  scaffoldProjectMetadata,
  identifyPendingProjects,
  mergeWithExistingDrafts,
  runScaffold,
  APPROVED_CATEGORIES,
} from '../scripts/scaffold-new-project.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const mockPublishedProjects = [
  {
    id: 'cainta-rizal',
    title: 'Electric Fence at Cainta, Rizal',
    project: 'fence',
    date: '2022',
    loc: 'prov',
    tags: ['Electric Fence', 'Provincial'],
    desc: 'Existing verified project in Cainta, Rizal.',
    thumbUrl: 'images/cainta-rizal/image001.jpg',
    category: 'Electric Fence',
    images: [{ src: 'images/cainta-rizal/image001.jpg', alt: 'Image 1' }],
  },
  {
    id: 'J.Molina street marikina city082826',
    title: 'Electric Fence at J.Molina Street, Marikina City',
    project: 'fence',
    date: '2026',
    loc: 'metro',
    tags: ['Electric Fence', 'Metro Manila'],
    desc: 'Existing Cloudinary-synced project in Marikina.',
    thumbUrl: 'https://res.cloudinary.com/test/image/upload/seia/J.Molina/img1.jpg',
    category: 'Electric Fence',
    images: [{ src: 'https://res.cloudinary.com/test/image/upload/seia/J.Molina/img1.jpg', alt: 'Image 1' }],
  },
];

// --- 1. Title Formatting Tests ---

test('formatDraftTitle: normalizes separators, applies title case, and adds standard service prefix', () => {
  assert.equal(
    formatDraftTitle('cainta-rizal'),
    'Electric Fence at Cainta, Rizal'
  );
  assert.equal(
    formatDraftTitle('san-mateo-rizal'),
    'Electric Fence at San Mateo, Rizal'
  );
});

test('formatDraftTitle: preserves acronyms and Roman numerals', () => {
  assert.equal(
    formatDraftTitle('cenacle-drive-vasra-qc-(8-lines)'),
    '8-Line Electric Fence at Cenacle Drive, VASRA, QC'
  );
  assert.equal(
    formatDraftTitle('marikina-city-iv-(8-lines)'),
    '8-Line Electric Fence at Marikina City IV'
  );
});

test('formatDraftTitle: handles line count indicators and feature flags', () => {
  assert.equal(
    formatDraftTitle('kymco-village-tandang-sora.(8-lines)-with-gsm-alarm'),
    '8-Line Electric Fence at Kymco Village Tandang Sora with GSM Alarm'
  );
});

test('formatDraftTitle: preserves service titles that already have specific prefixes', () => {
  assert.equal(
    formatDraftTitle('office-cctv-installation'),
    'Office CCTV Installation'
  );
  assert.equal(
    formatDraftTitle('warehouse-security-system'),
    'Warehouse Security System'
  );
  assert.equal(
    formatDraftTitle('site-project-001'),
    'Site Project 001'
  );
});

// --- 2. Category Determination Tests ---

test('determineCategory: infers category from keywords or defaults to approved category', () => {
  const gate = determineCategory('sliding-gate-installation');
  assert.equal(gate.category, 'Automatic Gate System');
  assert.equal(gate.source, 'inferred');

  const cctv = determineCategory('perimeter-cctv-cameras');
  assert.equal(cctv.category, 'Perimeter Security');
  assert.equal(cctv.source, 'inferred');

  const fence = determineCategory('residence-perimeter-8-lines');
  assert.equal(fence.category, 'Electric Fence');
  assert.equal(fence.source, 'inferred');

  const generic = determineCategory('generic-project-alpha');
  assert.equal(generic.category, 'Electric Fence');
  assert.equal(generic.source, 'default');
});

test('determineCategory: rejects unapproved default category', () => {
  assert.throws(
    () => determineCategory('some-folder', 'Invalid Category Nonexistent'),
    /Invalid default category/
  );
});

// --- 3. Date and Location Inference Tests ---

test('inferDateAndLocation: detects geographic location and date stamps from folder name', () => {
  const res1 = inferDateAndLocation('J.Molina street marikina city082826');
  assert.equal(res1.loc, 'metro');
  assert.equal(res1.date, '2026');
  assert.equal(res1.dateInferred, true);
  assert.equal(res1.locInferred, true);

  const res2 = inferDateAndLocation('greenwoods_taytay_rizal_09172025');
  assert.equal(res2.loc, 'prov');
  assert.equal(res2.date, '2025');
  assert.equal(res2.locInferred, true);
});

// --- 4. Pending Project Identification Tests ---

test('identifyPendingProjects: correctly splits registered vs pending project folders', () => {
  const projectMap = new Map([
    [
      'cainta-rizal',
      [{ public_id: 'seia/cainta-rizal/img1', secure_url: 'https://res.cloudinary.com/test/cainta1.jpg' }],
    ],
    [
      'new-project-antipolo',
      [
        { public_id: 'seia/new-project-antipolo/img1', secure_url: 'https://res.cloudinary.com/test/ant1.jpg' },
        { public_id: 'seia/new-project-antipolo/img2', secure_url: 'https://res.cloudinary.com/test/ant2.jpg' },
      ],
    ],
  ]);

  const { registered, pending } = identifyPendingProjects(projectMap, mockPublishedProjects);

  assert.equal(registered.length, 1);
  assert.equal(registered[0].projectId, 'cainta-rizal');

  assert.equal(pending.length, 1);
  assert.equal(pending[0].projectId, 'new-project-antipolo');
  assert.equal(pending[0].assets.length, 2);
});

// --- 5. Schema Compliance & Draft Metadata Generation ---

test('scaffoldProjectMetadata: produces 100% schema-compliant draft object with review metadata', () => {
  const assets = [
    { public_id: 'seia/antipolo-hills/img1', secure_url: 'https://res.cloudinary.com/test/img1.jpg' },
    { public_id: 'seia/antipolo-hills/img2', secure_url: 'https://res.cloudinary.com/test/img2.jpg' },
  ];

  const draft = scaffoldProjectMetadata('antipolo-hills-(6-lines)', assets);

  // Check required schema fields
  assert.equal(draft.id, 'antipolo-hills-(6-lines)');
  assert.equal(draft.title, '6-Line Electric Fence at Antipolo Hills');
  assert.equal(draft.project, 'fence');
  assert.ok(draft.date, 'Must have a date');
  assert.equal(draft.loc, 'prov');
  assert.ok(Array.isArray(draft.tags) && draft.tags.length > 0, 'Must have tags array');
  assert.match(draft.desc, /\[DRAFT\]/, 'Must flag draft description');
  assert.equal(draft.thumbUrl, 'https://res.cloudinary.com/test/img1.jpg');
  assert.equal(draft.category, 'Electric Fence');
  assert.equal(draft.images.length, 2);
  assert.equal(draft.images[0].src, 'https://res.cloudinary.com/test/img1.jpg');
  assert.equal(draft.images[0].alt, '6-Line Electric Fence at Antipolo Hills - Image 1');

  // Check _review metadata
  assert.equal(draft._review.status, 'NEEDS_MANUAL_REVIEW');
  assert.equal(draft._review.requiresManualInput, true);
  assert.ok(draft._review.missingFields.includes('desc'));
});

// --- 6. Preservation of Previous Draft Edits ---

test('mergeWithExistingDrafts: preserves manual edits made in existing draft file', () => {
  const previousDraftsWrapper = {
    version: '1.0.0',
    drafts: [
      {
        id: 'pending-project-x',
        title: 'Manually Customized Title by Editor',
        desc: 'Custom authored project description written by editor.',
        category: 'Perimeter Security',
        project: 'security',
        loc: 'metro',
        date: '2025',
        tags: ['Perimeter Security', 'Custom Tag'],
        thumbUrl: 'https://old-thumb.jpg',
        images: [{ src: 'https://old-thumb.jpg', alt: 'Old' }],
        _review: { status: 'PARTIALLY_REVIEWED' },
      },
    ],
  };

  const newDiscoveredDrafts = [
    {
      id: 'pending-project-x',
      title: 'Electric Fence at Pending Project X',
      desc: '[DRAFT] Default description',
      category: 'Electric Fence',
      project: 'fence',
      loc: 'prov',
      date: '2026',
      tags: ['Electric Fence'],
      thumbUrl: 'https://res.cloudinary.com/test/latest-thumb.jpg',
      images: [
        { src: 'https://res.cloudinary.com/test/latest-thumb.jpg', alt: 'Image 1' },
        { src: 'https://res.cloudinary.com/test/new-image-2.jpg', alt: 'Image 2' },
      ],
      _review: { status: 'NEEDS_MANUAL_REVIEW' },
    },
    {
      id: 'brand-new-folder',
      title: 'Electric Fence at Brand New Folder',
      desc: '[DRAFT] New',
      category: 'Electric Fence',
      project: 'fence',
      loc: 'metro',
      date: '2026',
      tags: ['Electric Fence'],
      thumbUrl: 'https://res.cloudinary.com/test/brand-new.jpg',
      images: [{ src: 'https://res.cloudinary.com/test/brand-new.jpg', alt: 'New 1' }],
      _review: { status: 'NEEDS_MANUAL_REVIEW' },
    },
  ];

  const merged = mergeWithExistingDrafts(newDiscoveredDrafts, previousDraftsWrapper, []);

  assert.equal(merged.length, 2);

  // Draft X should have preserved manually reviewed text
  const draftX = merged.find((d) => d.id === 'pending-project-x');
  assert.equal(draftX.title, 'Manually Customized Title by Editor');
  assert.equal(draftX.desc, 'Custom authored project description written by editor.');
  assert.equal(draftX.category, 'Perimeter Security');
  // Images should have updated to latest Cloudinary discovery
  assert.equal(draftX.thumbUrl, 'https://res.cloudinary.com/test/latest-thumb.jpg');
  assert.equal(draftX.images.length, 2);

  // Brand new folder should be added cleanly
  const brandNew = merged.find((d) => d.id === 'brand-new-folder');
  assert.ok(brandNew, 'Brand new folder must be included');
});

// --- 7. Dry-Run & Write Mode Isolation Tests ---

test('runScaffold: dry-run mode does not create or modify files', async () => {
  const tempDraftPath = path.join(ROOT_DIR, `test-draft-dry-run-${Date.now()}.json`);

  const mockAssets = [
    {
      public_id: 'seia/new-discovery/img1.jpg',
      secure_url: 'https://res.cloudinary.com/test/new1.jpg',
    },
  ];

  const result = await runScaffold({
    write: false,
    draftPath: tempDraftPath,
    providedAssets: mockAssets,
  });

  assert.equal(result.writeMode, false);
  assert.equal(result.written, false);
  assert.equal(fs.existsSync(tempDraftPath), false, 'Draft file must not be created during dry-run');
});

test('runScaffold: write mode writes valid atomic draft output and preserves published dataset', async () => {
  const tempDraftPath = path.join(ROOT_DIR, `test-draft-write-${Date.now()}.json`);

  const mockAssets = [
    {
      public_id: 'seia/new-discovery-write/img1.jpg',
      secure_url: 'https://res.cloudinary.com/test/write1.jpg',
    },
  ];

  try {
    const result = await runScaffold({
      write: true,
      draftPath: tempDraftPath,
      providedAssets: mockAssets,
    });

    assert.equal(result.writeMode, true);
    assert.equal(result.written, true);
    assert.ok(fs.existsSync(tempDraftPath), 'Draft file must be created during write mode');

    const draftContent = JSON.parse(fs.readFileSync(tempDraftPath, 'utf8'));
    assert.equal(draftContent.version, '1.0.0');
    assert.equal(draftContent.drafts.length, 1);
    assert.equal(draftContent.drafts[0].id, 'new-discovery-write');
    assert.equal(draftContent.drafts[0].category, 'Electric Fence');
  } finally {
    if (fs.existsSync(tempDraftPath)) {
      fs.unlinkSync(tempDraftPath);
    }
  }
});

// --- 8. Error Handling & Security Boundaries ---

test('runScaffold: missing credentials without provided assets throws explicit error', async () => {
  await assert.rejects(
    async () => {
      await runScaffold({
        env: { CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' },
        providedAssets: null,
      });
    },
    /Missing required Cloudinary environment variables/
  );
});

test('scaffoldProjectMetadata: throws error if project ID or assets array is empty', () => {
  assert.throws(() => scaffoldProjectMetadata('', []), /Project ID is required/);
  assert.throws(() => scaffoldProjectMetadata('test-id', []), /contains no assets/);
});
