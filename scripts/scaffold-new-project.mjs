/**
 * Build-time Cloudinary Project Metadata Scaffolding Utility
 *
 * Discovers pending Cloudinary project folders (under seia/<project-id>/)
 * that have not yet been registered in portfolio-data.json, and generates
 * reviewable draft metadata entries with consistently formatted titles,
 * valid default categories, and compliant schema structures.
 *
 * CRITICAL DESIGN CONSTRAINTS:
 * 1. Read-only by default (--dry-run). Only writes when --write is explicitly provided.
 * 2. Never writes to or modifies portfolio-data.json. Drafts are isolated in portfolio-drafts.json.
 * 3. Never exposes Cloudinary API secrets to client bundles.
 * 4. Preserves manual edits in existing portfolio-drafts.json when re-run.
 *
 * CLI Usage:
 *   node scripts/scaffold-new-project.mjs [--dry-run] [--write] [--category=<cat>] [--draft-path=<path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEnvironment,
  fetchCloudinaryAssets,
  groupAssetsByProject,
  writeDatasetSafely,
} from './sync-cloudinary-portfolio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_PORTFOLIO_PATH = path.join(ROOT_DIR, 'portfolio-data.json');
export const DEFAULT_DRAFT_PATH = path.join(ROOT_DIR, 'portfolio-drafts.json');

// Approved category vocabulary recognized by the frontend and portfolio schema
export const APPROVED_CATEGORIES = Object.freeze([
  'Electric Fence',
  'Automatic Gate System',
  'Perimeter Security',
]);

export const DEFAULT_CATEGORY = 'Electric Fence';

const KNOWN_ACRONYMS = new Set([
  'QC',
  'CCTV',
  'GSM',
  'VASRA',
  'LED',
  'SMS',
  'ID',
  'SEIA',
]);

const ROMAN_NUMERALS = new Set([
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
]);

const LOWERCASE_PARTICLES = new Set([
  'at',
  'in',
  'of',
  'on',
  'and',
  'the',
  'for',
  'with',
  'to',
]);

const METRO_MANILA_KEYWORDS = [
  'qc',
  'quezon city',
  'marikina',
  'pasig',
  'taguig',
  'makati',
  'manila',
  'caloocan',
  'valenzuela',
  'las pinas',
  'paranaque',
  'muntinlupa',
  'mandaluyong',
  'san juan',
  'malabon',
  'navotas',
  'pateros',
  'novaliches',
  'tandang sora',
  'v.luna',
  'vasra',
  'lagro',
  'laloma',
  'bahay toro',
];

const PROVINCIAL_KEYWORDS = [
  'rizal',
  'bulacan',
  'laguna',
  'cavite',
  'batangas',
  'baguio',
  'pampanga',
  'cebu',
  'davao',
  'olongapo',
  'antipolo',
  'cainta',
  'taytay',
  'tay-tay',
  'san mateo',
  'meycauyan',
];

/**
 * Format project folder identifier into human-readable draft title.
 * Deterministic, preserves acronyms, Roman numerals, line-counts, and clean spacing.
 *
 * @param {string} folderId - Cloudinary folder identifier (e.g. "cainta-rizal-(8-lines)")
 * @returns {string} Formatted project title
 */
export function formatDraftTitle(folderId) {
  if (!folderId || typeof folderId !== 'string') return '';
  let raw = decodeURIComponent(folderId).trim();


  // 1. Extract feature flags (e.g., with-gsm-alarm)
  let featureSuffix = '';
  const gsmMatch = raw.match(/[-_.( ]*with[-_ ]+gsm[-_ ]+alarm[-_.]*/i);
  if (gsmMatch) {
    featureSuffix = ' with GSM Alarm';
    raw = raw.replace(gsmMatch[0], ' ');
  }

  // 2. Extract and standardize line count indicators (e.g., (8-lines), -8lines, -(6-lines))
  let linePrefix = '';
  const lineMatch = raw.match(/[-_.( ]*\(?([0-9]+)[-_ ]*lines?\)?[-_.]*/i);
  if (lineMatch) {
    linePrefix = `${lineMatch[1]}-Line `;
    raw = raw.replace(lineMatch[0], ' ');
  }

  // 3. Remove trailing date stamp patterns like 082826, 09172025
  const dateMatch = raw.match(/[-_ ]*([0-1][0-9])([0-3][0-9])(20\d{2}|\d{2})$/);
  if (dateMatch) {
    raw = raw.slice(0, dateMatch.index).trim();
  }

  // 4. Normalize delimiters and clean punctuation
  let cleaned = raw
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. Tokenize and apply casing rules
  const tokens = cleaned.split(' ').filter(Boolean);
  const formattedTokens = tokens.map((token, idx) => {
    const upper = token.toUpperCase();
    if (KNOWN_ACRONYMS.has(upper)) return upper;
    if (ROMAN_NUMERALS.has(upper)) return upper;
    if (idx > 0 && LOWERCASE_PARTICLES.has(token.toLowerCase())) {
      return token.toLowerCase();
    }
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  });

  let titleBody = formattedTokens.join(' ');

  // 6. Format geographic commas (e.g. "Cainta Rizal" -> "Cainta, Rizal")
  titleBody = titleBody
    .replace(
      /\b(QC|Rizal|Bulacan|Novaliches|Antipolo|Marikina|Caloocan|Batasan|Navotas|Taytay|VASRA)\b/g,
      (match, p1, offset, string) => {
        const prev = string.slice(0, offset).trim();
        if (
          prev &&
          !prev.endsWith(',') &&
          !prev.endsWith('at') &&
          !prev.endsWith('in')
        ) {
          return `, ${p1}`;
        }
        return p1;
      }
    )
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();

  // 7. Apply service prefix if title is purely a location or generic description
  const hasServicePrefix = /^(Electric Fence|Automatic Gate|Security|CCTV|Warehouse|Office|Site Project)/i.test(
    titleBody
  );

  let finalTitle = '';
  if (linePrefix) {
    finalTitle = linePrefix + (hasServicePrefix ? titleBody : `Electric Fence at ${titleBody}`);
  } else if (!hasServicePrefix) {
    finalTitle = `Electric Fence at ${titleBody}`;
  } else {
    finalTitle = titleBody;
  }

  return (finalTitle + featureSuffix)
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

/**
 * Determine valid category based on keywords or approved default.
 *
 * @param {string} folderId - Project folder name
 * @param {string} configuredDefault - User or system default category
 * @returns {{ category: string, source: 'inferred' | 'default', isApproved: boolean }}
 */
export function determineCategory(folderId, configuredDefault = DEFAULT_CATEGORY) {
  if (!APPROVED_CATEGORIES.includes(configuredDefault)) {
    throw new Error(
      `Invalid default category "${configuredDefault}". Must be one of: ${APPROVED_CATEGORIES.join(', ')}`
    );
  }

  const lower = (folderId || '').toLowerCase();

  if (/gate|sliding|swing|motor|barrier/.test(lower)) {
    return {
      category: 'Automatic Gate System',
      source: 'inferred',
      isApproved: true,
    };
  }

  if (/cctv|camera|alarm|sensor|access control/.test(lower)) {
    return {
      category: 'Perimeter Security',
      source: 'inferred',
      isApproved: true,
    };
  }

  if (/fence|lines?|wire|energizer/.test(lower)) {
    return {
      category: 'Electric Fence',
      source: 'inferred',
      isApproved: true,
    };
  }

  return {
    category: configuredDefault,
    source: 'default',
    isApproved: true,
  };
}

/**
 * Infer date and location from folder name and asset metadata.
 *
 * @param {string} folderId - Project folder identifier
 * @param {Array<Object>} assets - Discovered Cloudinary assets
 * @returns {{ date: string, loc: 'metro' | 'prov', dateInferred: boolean, locInferred: boolean }}
 */
export function inferDateAndLocation(folderId, assets = []) {
  const lower = (folderId || '').toLowerCase();

  // 1. Inferred Location
  let loc = 'metro';
  let locInferred = false;

  for (const provKey of PROVINCIAL_KEYWORDS) {
    if (lower.includes(provKey)) {
      loc = 'prov';
      locInferred = true;
      break;
    }
  }

  if (!locInferred) {
    for (const metroKey of METRO_MANILA_KEYWORDS) {
      if (lower.includes(metroKey)) {
        loc = 'metro';
        locInferred = true;
        break;
      }
    }
  }

  // 2. Inferred Date
  let date = '2026';
  let dateInferred = false;

  // Check folder name for date stamps (e.g. 082826 -> 2026 or 09172025 -> 2025)
  const dateMatch = lower.match(/([0-1][0-9])([0-3][0-9])(20\d{2}|\d{2})$/);
  if (dateMatch) {
    const rawYr = dateMatch[3];
    date = rawYr.length === 2 ? `20${rawYr}` : rawYr;
    dateInferred = true;
  } else {
    // Check 4-digit year pattern in folder name (e.g., 2022 to 2030)
    const yearMatch = lower.match(/\b(202[0-9]|203[0-9])\b/);
    if (yearMatch) {
      date = yearMatch[1];
      dateInferred = true;
    } else if (assets.length > 0 && assets[0].created_at) {
      // Fallback to earliest asset created_at year
      const year = String(assets[0].created_at).slice(0, 4);
      if (/^20\d{2}$/.test(year)) {
        date = year;
        dateInferred = true;
      }
    }
  }

  return { date, loc, dateInferred, locInferred };
}

/**
 * Scaffold a complete, schema-compliant draft project entry.
 *
 * @param {string} projectId - Cloudinary project folder identifier
 * @param {Array<Object>} assets - Array of discovered image asset objects
 * @param {Object} options - Scaffolding options
 * @returns {Object} Draft project metadata object
 */
export function scaffoldProjectMetadata(projectId, assets, options = {}) {
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    throw new Error('Project ID is required for scaffolding');
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error(`Project "${projectId}" contains no assets to scaffold`);
  }

  const { defaultCategory = DEFAULT_CATEGORY } = options;

  const title = formatDraftTitle(projectId);
  const { category, source: categorySource } = determineCategory(projectId, defaultCategory);
  const { date, loc, dateInferred, locInferred } = inferDateAndLocation(projectId, assets);

  // Derive project type code
  const project = category === 'Automatic Gate System' ? 'gate' : 'fence';

  // Construct draft tags
  const locLabel = loc === 'metro' ? 'Metro Manila' : 'Provincial';
  const tags = [category, locLabel];

  // Primary cover thumbnail
  const thumbUrl = assets[0].secure_url;

  // Gallery images array
  const images = assets.map((a, idx) => ({
    src: a.secure_url,
    alt: `${title} - Image ${idx + 1}`,
  }));

  // Safe draft description placeholder
  const desc = `[DRAFT] Professional perimeter security installation at ${title}. Pending manual review of installation specifications, line count, and client details.`;

  // Review metadata (kept under isolated _review key so it doesn't break schema)
  const missingFields = ['desc'];
  if (!dateInferred) missingFields.push('date');
  if (!locInferred) missingFields.push('loc');

  return {
    id: projectId,
    title,
    project,
    date,
    loc,
    tags,
    desc,
    thumbUrl,
    category,
    images,
    _review: {
      status: 'NEEDS_MANUAL_REVIEW',
      categorySource,
      dateInferred,
      locInferred,
      missingFields,
      assetCount: assets.length,
      requiresManualInput: true,
      notes: 'Verify project description, specific installation year, and location before publishing to portfolio-data.json.',
    },
  };
}

/**
 * Identify pending projects by comparing discovered Cloudinary groups against published projects.
 *
 * @param {Map<string, Array<Object>>} projectAssetMap - Grouped Cloudinary assets
 * @param {Array<Object>} publishedProjects - Existing published portfolio items
 * @returns {{ registered: Array<Object>, pending: Array<{ projectId: string, assets: Array<Object> }> }}
 */
export function identifyPendingProjects(projectAssetMap, publishedProjects) {
  const publishedIdSet = new Set(
    (publishedProjects || []).map((p) => p && p.id).filter(Boolean)
  );

  const registered = [];
  const pending = [];

  for (const [projectId, assets] of projectAssetMap.entries()) {
    if (publishedIdSet.has(projectId)) {
      registered.push({ projectId, assetCount: assets.length });
    } else {
      pending.push({ projectId, assets });
    }
  }

  // Sort deterministically by project identifier
  pending.sort((a, b) => a.projectId.localeCompare(b.projectId));
  registered.sort((a, b) => a.projectId.localeCompare(b.projectId));

  return { registered, pending };
}

/**
 * Merge newly scaffolded drafts with an existing draft file if present,
 * preserving existing manual reviews and updates.
 *
 * @param {Array<Object>} newDrafts - Freshly generated draft entries
 * @param {Object|null} existingDraftsWrapper - Existing drafts JSON wrapper
 * @param {Array<Object>} publishedProjects - Published projects (to prune graduated items)
 * @returns {Array<Object>} Merged drafts array
 */
export function mergeWithExistingDrafts(newDrafts, existingDraftsWrapper, publishedProjects = []) {
  const publishedIdSet = new Set(
    (publishedProjects || []).map((p) => p && p.id).filter(Boolean)
  );

  const existingMap = new Map();
  if (existingDraftsWrapper && Array.isArray(existingDraftsWrapper.drafts)) {
    for (const d of existingDraftsWrapper.drafts) {
      if (d && d.id && !publishedIdSet.has(d.id)) {
        existingMap.set(d.id, d);
      }
    }
  }

  const merged = [];
  for (const draft of newDrafts) {
    if (publishedIdSet.has(draft.id)) {
      // Project has since been published; omit from pending drafts
      continue;
    }

    const prev = existingMap.get(draft.id);
    if (prev) {
      // Preserve manual customizations made by the developer in the draft file
      const preservedDraft = {
        ...draft,
        title: prev.title || draft.title,
        desc: prev.desc || draft.desc,
        category: prev.category || draft.category,
        project: prev.project || draft.project,
        loc: prev.loc || draft.loc,
        date: prev.date || draft.date,
        tags: Array.isArray(prev.tags) ? prev.tags : draft.tags,
        // Always refresh images and thumbnail to latest Cloudinary inventory
        thumbUrl: draft.thumbUrl,
        images: draft.images,
        _review: {
          ...draft._review,
          status: prev._review?.status || draft._review.status,
          userModified: true,
        },
      };
      merged.push(preservedDraft);
      existingMap.delete(draft.id);
    } else {
      merged.push(draft);
    }
  }

  // If there were any existing drafts not in newDrafts, keep them if not published
  for (const leftover of existingMap.values()) {
    merged.push(leftover);
  }

  merged.sort((a, b) => a.id.localeCompare(b.id));
  return merged;
}

/**
 * Format human-readable terminal report.
 */
export function formatScaffoldReport(result) {
  const { summary, pendingDrafts, registeredProjects, writeMode, targetDraftPath } = result;

  const lines = [
    '=================================================================',
    '  SEIA PORTFOLIO PROJECT METADATA SCAFFOLDING REPORT',
    '=================================================================',
    `Execution Mode:            ${writeMode ? 'WRITE (--write)' : 'DRY-RUN (read-only)'}`,
    `Published Projects Count:  ${summary.publishedProjectsCount}`,
    `Discovered Cloudinary:     ${summary.discoveredAssetCount} assets across ${summary.discoveredFolderCount} folders`,
    `Already Registered:        ${registeredProjects.length} folders`,
    `Pending New Projects:      ${pendingDrafts.length} folders`,
    '-----------------------------------------------------------------',
  ];

  if (registeredProjects.length > 0) {
    lines.push('Registered Folders (Skipped from Scaffolding):');
    for (const r of registeredProjects) {
      lines.push(`  ✓ "${r.projectId}" (${r.assetCount} assets)`);
    }
    lines.push('-----------------------------------------------------------------');
  }

  if (pendingDrafts.length === 0) {
    lines.push('Status: NO PENDING PROJECTS FOUND');
    lines.push('All discovered Cloudinary folders are already registered in portfolio-data.json.');
  } else {
    lines.push('Pending Projects Scaffolding Proposals:');
    for (const d of pendingDrafts) {
      lines.push(`  + ID:        ${d.id}`);
      lines.push(`    Title:     ${d.title}`);
      lines.push(`    Category:  ${d.category} (${d._review.categorySource})`);
      lines.push(`    Location:  ${d.loc} (inferred: ${d._review.locInferred})`);
      lines.push(`    Date:      ${d.date} (inferred: ${d._review.dateInferred})`);
      lines.push(`    Images:    ${d.images.length} assets`);
      lines.push(`    Review:    Missing required manual review: [${d._review.missingFields.join(', ')}]`);
      lines.push('');
    }
  }

  lines.push('-----------------------------------------------------------------');
  if (writeMode && pendingDrafts.length > 0) {
    lines.push(`Output: DRAFT WRITTEN TO ${targetDraftPath}`);
    lines.push('Review the draft file and transfer approved projects into portfolio-data.json.');
  } else if (!writeMode && pendingDrafts.length > 0) {
    lines.push('Dry-run complete. No files written. Pass --write to persist drafts.');
  }
  lines.push('=================================================================');

  return lines.join('\n');
}

/**
 * Main Scaffolding Orchestrator
 *
 * @param {Object} options - CLI and execution options
 * @returns {Promise<Object>} Execution result
 */
export async function runScaffold(options = {}) {
  const {
    env = process.env,
    portfolioPath = DEFAULT_PORTFOLIO_PATH,
    draftPath = DEFAULT_DRAFT_PATH,
    write = false,
    defaultCategory = DEFAULT_CATEGORY,
    prefix = 'seia',
    fetchFn = globalThis.fetch,
    providedAssets = null,
  } = options;

  // 1. Verify published portfolio dataset exists
  if (!fs.existsSync(portfolioPath)) {
    throw new Error(`Published portfolio dataset not found at: ${portfolioPath}`);
  }
  const publishedRaw = fs.readFileSync(portfolioPath, 'utf8');
  const publishedProjects = JSON.parse(publishedRaw);

  if (!Array.isArray(publishedProjects)) {
    throw new Error('portfolio-data.json must contain a top-level array of projects');
  }

  // 2. Discover Cloudinary assets
  let assets = providedAssets;
  if (!assets) {
    const credentials = validateEnvironment(env);
    assets = await fetchCloudinaryAssets({ ...credentials, prefix }, fetchFn);
  }

  if (!Array.isArray(assets)) {
    throw new Error('Asset discovery returned invalid non-array result');
  }

  // 3. Group assets by project folder
  const projectAssetMap = groupAssetsByProject(assets, prefix);

  // 4. Identify pending projects vs registered projects
  const { registered, pending } = identifyPendingProjects(projectAssetMap, publishedProjects);

  // 5. Generate draft entries for all pending projects
  const newDraftEntries = pending.map((p) =>
    scaffoldProjectMetadata(p.projectId, p.assets, { defaultCategory })
  );

  // 6. Merge with existing draft file if present
  let existingDraftsWrapper = null;
  if (fs.existsSync(draftPath)) {
    try {
      const existingRaw = fs.readFileSync(draftPath, 'utf8');
      existingDraftsWrapper = JSON.parse(existingRaw);
    } catch {
      existingDraftsWrapper = null;
    }
  }

  const finalDrafts = mergeWithExistingDrafts(
    newDraftEntries,
    existingDraftsWrapper,
    publishedProjects
  );

  const summary = {
    publishedProjectsCount: publishedProjects.length,
    discoveredAssetCount: assets.length,
    discoveredFolderCount: projectAssetMap.size,
    registeredCount: registered.length,
    pendingCount: pending.length,
    finalDraftsCount: finalDrafts.length,
  };

  const result = {
    summary,
    registeredProjects: registered,
    pendingDrafts: finalDrafts,
    writeMode: write,
    targetDraftPath: draftPath,
    written: false,
  };

  // 7. Write drafts if write mode enabled
  if (write) {
    const draftArtifact = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      summary,
      drafts: finalDrafts,
    };
    writeDatasetSafely(draftPath, draftArtifact);
    result.written = true;
  }

  return result;
}

/**
 * CLI Runner
 */
export async function runScaffoldCli(argv = process.argv) {
  const getArg = (name) => {
    const item = argv.find((a) => a.startsWith(`--${name}`));
    if (!item) return null;
    const parts = item.split('=');
    return parts.length > 1 ? parts[1] : true;
  };

  const write = Boolean(getArg('write'));
  const category = getArg('category') || DEFAULT_CATEGORY;
  const draftPath = getArg('draft-path') || DEFAULT_DRAFT_PATH;
  const portfolioPath = getArg('portfolio-path') || DEFAULT_PORTFOLIO_PATH;
  const prefix = getArg('prefix') || 'seia';

  try {
    const result = await runScaffold({
      write,
      defaultCategory: category,
      draftPath,
      portfolioPath,
      prefix,
    });

    const report = formatScaffoldReport(result);
    console.log(report);
    process.exit(0);
  } catch (err) {
    console.error(`✗ Scaffolding failed: ${err.message}`);
    process.exit(1);
  }
}

// Direct invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScaffoldCli();
}
