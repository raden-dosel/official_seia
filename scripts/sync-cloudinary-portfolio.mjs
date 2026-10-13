/**
 * Build-time Cloudinary to Portfolio Data Synchronization Utility
 *
 * Synchronizes portfolio media assets from Cloudinary into portfolio-data.json
 * preserving manual curation, existing schema, and deterministic ordering.
 *
 * FRESHNESS & INTEGRITY ENFORCEMENT:
 * - Proves pagination completeness (follows all next_cursor pages; detects loops).
 * - Tracks every discovered asset with explicit disposition (Mapped, Pending, Excluded, Rejected).
 * - Detects unexpected data loss (verifies previously published Cloudinary images are not missing).
 * - Enforces complete schema & HTTPS validation for all portfolio projects.
 * - Atomic write + rename preserves last-known-good dataset on any failure.
 * - Provides structured machine-readable summary for CI reporting.
 *
 * SECURITY:
 * - Build-time only (Node.js). Never bundled or called in browser.
 * - Credentials read strictly from process.env.
 * - Never logs or exposes API secret.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORTFOLIO_DATA_PATH = path.join(ROOT_DIR, 'portfolio-data.json');

/**
 * Validate required environment credentials
 */
export function validateEnvironment(env = process.env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();

  const missing = [];
  if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Cloudinary environment variables: ${missing.join(', ')}. ` +
      `Ensure these are configured as GitHub Actions Secrets or local environment variables.`
    );
  }

  return { cloudName, apiKey, apiSecret };
}

/**
 * Build Basic Auth header for Cloudinary Admin API
 */
export function createAuthHeader(apiKey, apiSecret) {
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Extract Cloudinary public_id from a secure delivery URL
 * e.g., https://res.cloudinary.com/demo/image/upload/v12345/seia/project-1/img.jpg
 * returns "seia/project-1/img"
 */
export function extractCloudinaryPublicId(url) {
  if (typeof url !== 'string' || !url.includes('cloudinary')) {
    return null;
  }
  const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch portfolio assets from Cloudinary Admin API using native fetch
 * Recursively pages through next_cursor until complete.
 * Proves pagination completeness and guards against endless loops.
 */
export async function fetchCloudinaryAssets(
  { cloudName, apiKey, apiSecret, prefix = 'seia' },
  fetchFn = globalThis.fetch
) {
  const authHeader = createAuthHeader(apiKey, apiSecret);
  const assets = [];
  const seenPublicIds = new Set();
  const seenCursors = new Set();
  let nextCursor = null;
  let pagesRequested = 0;
  let pagesRetrieved = 0;
  let duplicateAssetsCount = 0;
  let malformedAssetsCount = 0;

  do {
    pagesRequested++;
    const url = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image`);
    url.searchParams.set('type', 'upload');
    url.searchParams.set('max_results', '500');
    if (prefix) {
      url.searchParams.set('prefix', prefix);
    }
    if (nextCursor) {
      url.searchParams.set('next_cursor', nextCursor);
    }

    let res;
    try {
      res = await fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });
    } catch (networkErr) {
      throw new Error(`Cloudinary API network failure on page ${pagesRequested}: ${networkErr.message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let sanitizedMessage = `Cloudinary API request failed on page ${pagesRequested} with status ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          sanitizedMessage += `: ${parsed.error.message}`;
        }
      } catch {
        // preserve sanitized message
      }
      throw new Error(sanitizedMessage);
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Malformed Cloudinary API response on page ${pagesRequested}: failed to parse JSON (${parseErr.message})`);
    }

    if (!data || !Array.isArray(data.resources)) {
      throw new Error(`Malformed Cloudinary API response on page ${pagesRequested}: expected resources array`);
    }

    pagesRetrieved++;

    for (const resItem of data.resources) {
      if (!resItem || typeof resItem !== 'object' || !resItem.public_id || !resItem.secure_url) {
        malformedAssetsCount++;
        continue;
      }

      if (seenPublicIds.has(resItem.public_id)) {
        duplicateAssetsCount++;
        continue;
      }

      seenPublicIds.add(resItem.public_id);
      assets.push({
        public_id: resItem.public_id,
        secure_url: resItem.secure_url,
        format: resItem.format,
        version: resItem.version,
        width: resItem.width,
        height: resItem.height,
        created_at: resItem.created_at,
      });
    }

    const returnedCursor = data.next_cursor || null;
    if (returnedCursor) {
      if (seenCursors.has(returnedCursor)) {
        throw new Error(`Pagination loop detected: Cloudinary Admin API returned repeating cursor "${returnedCursor}"`);
      }
      seenCursors.add(returnedCursor);
    }
    nextCursor = returnedCursor;
  } while (nextCursor);

  // Attach discovery statistics for accounting while keeping Array contract
  assets.discoveryStats = {
    pagesRequested,
    pagesRetrieved,
    totalDiscovered: assets.length + duplicateAssetsCount + malformedAssetsCount,
    validUniqueAssets: assets.length,
    duplicateAssets: duplicateAssetsCount,
    malformedAssets: malformedAssetsCount,
  };

  return assets;
}

/**
 * Group Cloudinary assets by folder hierarchy
 * e.g., "seia/J.Molina street marikina city082826/jasnroadfjj8euq9o1lk"
 * Folder ID becomes "J.Molina street marikina city082826"
 * Explicitly accounts for eligible, excluded, and invalid assets.
 */
export function groupAssetsByProject(assets, folderPrefix = 'seia') {
  const projectMap = new Map();
  const accounting = {
    eligible: 0,
    excluded: [],
    invalid: [],
  };

  for (const asset of assets) {
    if (!asset || !asset.public_id) {
      accounting.invalid.push({ asset, reason: 'Missing or empty public_id' });
      continue;
    }

    const parts = asset.public_id.split('/');
    let projectId = null;

    if (parts.length >= 3 && parts[0] === folderPrefix) {
      projectId = parts[1];
    } else if (parts.length === 2 && parts[0] !== folderPrefix) {
      projectId = parts[0];
    }

    if (!projectId || projectId.trim() === '') {
      accounting.excluded.push({
        public_id: asset.public_id,
        reason: parts[0] === folderPrefix
          ? 'Standalone asset located directly in prefix folder without project subfolder'
          : 'Asset public_id does not conform to project folder hierarchy',
      });
      continue;
    }

    accounting.eligible++;

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, []);
    }
    projectMap.get(projectId).push(asset);
  }

  // Sort images deterministically within each group and ensure deduplication
  for (const [projectId, imgList] of projectMap.entries()) {
    const seenGroupIds = new Set();
    const dedupedList = [];
    for (const img of imgList) {
      if (!seenGroupIds.has(img.public_id)) {
        seenGroupIds.add(img.public_id);
        dedupedList.push(img);
      }
    }

    dedupedList.sort((a, b) => {
      if (a.created_at && b.created_at && a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      return a.public_id.localeCompare(b.public_id);
    });

    projectMap.set(projectId, dedupedList);
  }

  projectMap.accounting = accounting;
  return projectMap;
}

/**
 * Detect unexpected data loss by comparing previously published Cloudinary asset references
 * against the latest discovery inventory.
 * Fails safely if previously published Cloudinary images or projects disappeared without authorization.
 */
export function detectUnexpectedDataLoss(existingItems, discoveredAssets, projectAssetMap) {
  const discoveredPublicIds = new Set(discoveredAssets.map((a) => a.public_id));
  const missingPublishedAssets = [];
  const projectsWithCloudinary = [];

  for (const item of existingItems) {
    const itemCloudinaryImages = [];
    for (const img of item.images || []) {
      if (img.src && (img.src.includes('res.cloudinary.com') || img.src.includes('cloudinary'))) {
        const pubId = extractCloudinaryPublicId(img.src);
        if (pubId) {
          itemCloudinaryImages.push({ pubId, src: img.src });
        }
      }
    }

    if (itemCloudinaryImages.length > 0) {
      projectsWithCloudinary.push({
        projectId: item.id,
        images: itemCloudinaryImages,
      });

      // Check if project was completely missing from discovery
      if (!projectAssetMap.has(item.id)) {
        for (const imgRef of itemCloudinaryImages) {
          missingPublishedAssets.push({
            projectId: item.id,
            public_id: imgRef.pubId,
            src: imgRef.src,
            reason: `Project folder "${item.id}" completely absent from Cloudinary discovery results`,
          });
        }
      } else {
        // Project folder was found; verify each previously published image was discovered
        for (const imgRef of itemCloudinaryImages) {
          if (!discoveredPublicIds.has(imgRef.pubId)) {
            missingPublishedAssets.push({
              projectId: item.id,
              public_id: imgRef.pubId,
              src: imgRef.src,
              reason: `Previously published asset missing from discovered project images`,
            });
          }
        }
      }
    }
  }

  // If we have published Cloudinary projects, but discovery returned 0 assets:
  if (projectsWithCloudinary.length > 0 && discoveredAssets.length === 0) {
    throw new Error(
      `Data freshness failure: Cloudinary discovery returned 0 assets, but ${projectsWithCloudinary.length} project(s) ` +
      `with ${projectsWithCloudinary.reduce((sum, p) => sum + p.images.length, 0)} previously published Cloudinary images require synchronization.`
    );
  }

  // If any previously published Cloudinary image is missing:
  if (missingPublishedAssets.length > 0) {
    const sample = missingPublishedAssets
      .slice(0, 3)
      .map((m) => `[${m.projectId}] ${m.public_id} (${m.reason})`)
      .join('; ');
    throw new Error(
      `Unexpected data loss detected: ${missingPublishedAssets.length} previously published Cloudinary asset(s) missing from discovery. Sample: ${sample}`
    );
  }

  return {
    projectsWithCloudinaryCount: projectsWithCloudinary.length,
    verifiedPublishedImagesCount: projectsWithCloudinary.reduce((acc, p) => acc + p.images.length, 0),
  };
}

/**
 * Merge Cloudinary asset groups into existing portfolio items.
 * Preserves manually curated metadata (title, desc, tags, category, loc, date).
 * Updates Cloudinary-managed media (thumbUrl, images array).
 * Explicitly tracks mapped vs pending assets.
 */
export function mergePortfolioData(existingItems, projectAssetMap) {
  const updatedItems = [];
  const matchedProjectIds = new Set();
  const mappedAssets = [];
  const pendingProjects = [];
  const pendingAssets = [];

  const stats = {
    totalExisting: existingItems.length,
    matchedProjects: 0,
    updatedProjects: 0,
    unchangedProjects: 0,
    unmatchedAssets: 0,
    newProjectsPending: 0,
  };

  // 1. Process existing items in their established order
  for (const item of existingItems) {
    const projectId = item.id;
    const assets = projectAssetMap.get(projectId);

    if (!assets || assets.length === 0) {
      // No Cloudinary assets found for this project; preserve local or existing asset
      updatedItems.push({ ...item });
      stats.unchangedProjects++;
      continue;
    }

    matchedProjectIds.add(projectId);
    stats.matchedProjects++;

    // Prepare new images array with secure Cloudinary delivery URLs
    const newImages = assets.map((asset, idx) => {
      const existingAlt = item.images?.[idx]?.alt;
      const altText = existingAlt || `Image ${idx + 1}`;
      mappedAssets.push({
        public_id: asset.public_id,
        projectId,
        disposition: 'MAPPED_PUBLISHED',
      });
      return {
        src: asset.secure_url,
        alt: altText,
      };
    });

    const newThumbUrl = assets[0]?.secure_url || item.thumbUrl;

    const thumbChanged = item.thumbUrl !== newThumbUrl;
    const imagesChanged = JSON.stringify(item.images) !== JSON.stringify(newImages);

    if (thumbChanged || imagesChanged) {
      stats.updatedProjects++;
      updatedItems.push({
        ...item,
        thumbUrl: newThumbUrl,
        images: newImages,
      });
    } else {
      stats.unchangedProjects++;
      updatedItems.push({ ...item });
    }
  }

  // 2. Identify Cloudinary project groups that don't match any existing item
  for (const [projectId, assets] of projectAssetMap.entries()) {
    if (!matchedProjectIds.has(projectId)) {
      stats.unmatchedAssets += assets.length;
      stats.newProjectsPending++;
      pendingProjects.push({ projectId, assetCount: assets.length });
      for (const asset of assets) {
        pendingAssets.push({
          public_id: asset.public_id,
          projectId,
          disposition: 'PENDING_UNMATCHED',
          reason: `Project folder "${projectId}" is not in portfolio-data.json; pending manual metadata curation`,
        });
      }
    }
  }

  return {
    updatedItems,
    stats,
    accounting: {
      mappedAssets,
      pendingProjects,
      pendingAssets,
    },
  };
}

/**
 * Validate the generated portfolio-data.json dataset against frontend expectations.
 * Protects against schema errors, duplicate IDs, missing images, and unintended project loss.
 */
export function validatePortfolioData(items, previousItems = null) {
  if (!Array.isArray(items)) {
    throw new Error('Portfolio dataset must be a top-level JSON array');
  }

  if (items.length === 0) {
    throw new Error('Portfolio dataset cannot be empty; aborting to prevent catastrophic data loss');
  }

  if (previousItems && Array.isArray(previousItems)) {
    if (items.length < previousItems.length) {
      throw new Error(
        `Portfolio dataset project count decreased from ${previousItems.length} to ${items.length}; project loss detected`
      );
    }
  }

  const seenIds = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `Item at index ${i}`;

    if (!item || typeof item !== 'object') {
      throw new Error(`${prefix} is not a valid JSON object`);
    }

    if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
      throw new Error(`${prefix} has missing or non-string "id"`);
    }

    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate project ID detected: "${item.id}"`);
    }
    seenIds.add(item.id);

    if (!item.title || typeof item.title !== 'string' || item.title.trim() === '') {
      throw new Error(`${prefix} (${item.id}) has missing or non-string "title"`);
    }

    if (!item.thumbUrl || typeof item.thumbUrl !== 'string' || item.thumbUrl.trim() === '') {
      throw new Error(`${prefix} (${item.id}) has missing or non-string "thumbUrl"`);
    }

    if (item.thumbUrl.startsWith('http:') && !item.thumbUrl.startsWith('https:')) {
      throw new Error(`${prefix} (${item.id}) thumbUrl must use HTTPS or local path`);
    }

    if (!Array.isArray(item.images) || item.images.length === 0) {
      throw new Error(`${prefix} (${item.id}) must have a non-empty "images" array`);
    }

    const seenImageUrls = new Set();
    for (let j = 0; j < item.images.length; j++) {
      const img = item.images[j];
      if (!img || !img.src || typeof img.src !== 'string' || img.src.trim() === '') {
        throw new Error(`${prefix} (${item.id}) image at index ${j} must have a valid string "src"`);
      }
      if (img.src.startsWith('http:') && !img.src.startsWith('https:')) {
        throw new Error(`${prefix} (${item.id}) image at index ${j} must use HTTPS`);
      }
      if (seenImageUrls.has(img.src)) {
        throw new Error(`${prefix} (${item.id}) duplicate image URL at index ${j}: "${img.src}"`);
      }
      seenImageUrls.add(img.src);
    }
  }

  return true;
}

/**
 * Safely write the updated dataset using atomic write + rename
 */
export function writeDatasetSafely(targetPath, data) {
  const jsonString = JSON.stringify(data, null, 2) + '\n';

  // Verify it parses cleanly back into JSON
  JSON.parse(jsonString);

  const tempPath = `${targetPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, jsonString, 'utf8');
  fs.renameSync(tempPath, targetPath);
}

/**
 * Main execution routine
 */
export async function runSync(options = {}) {
  const {
    dryRun = false,
    env = process.env,
    dataPath = PORTFOLIO_DATA_PATH,
    fetchFn = globalThis.fetch,
  } = options;

  const startTime = new Date().toISOString();
  console.log(`[Cloudinary Sync] Starting synchronization (mode: ${dryRun ? 'DRY-RUN' : 'WRITE'})...`);

  // 1. Read existing dataset
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Target dataset file not found at: ${dataPath}`);
  }
  const existingRaw = fs.readFileSync(dataPath, 'utf8');
  const existingItems = JSON.parse(existingRaw);

  // 2. Validate environment
  const credentials = validateEnvironment(env);

  // 3. Fetch assets with full pagination completeness verification
  console.log(`[Cloudinary Sync] Querying Cloudinary Admin API for cloud "${credentials.cloudName}"...`);
  const assets = await fetchCloudinaryAssets(credentials, fetchFn);
  const discoveryStats = assets.discoveryStats || {
    pagesRequested: 1,
    pagesRetrieved: 1,
    totalDiscovered: assets.length,
    validUniqueAssets: assets.length,
    duplicateAssets: 0,
    malformedAssets: 0,
  };
  console.log(`[Cloudinary Sync] Retrieved ${assets.length} unique assets across ${discoveryStats.pagesRetrieved} page(s).`);

  // 4. Group assets by folder and classify dispositions
  const projectAssetMap = groupAssetsByProject(assets, 'seia');
  const groupAccounting = projectAssetMap.accounting || { eligible: assets.length, excluded: [], invalid: [] };
  console.log(`[Cloudinary Sync] Grouped into ${projectAssetMap.size} project collections (${groupAccounting.eligible} eligible, ${groupAccounting.excluded.length} excluded).`);

  // 5. Detect unexpected data loss against published dataset
  const lossCheck = detectUnexpectedDataLoss(existingItems, assets, projectAssetMap);
  console.log(`[Cloudinary Sync] Data freshness verified (${lossCheck.verifiedPublishedImagesCount} published Cloudinary references confirmed).`);

  // 6. Merge with existing dataset
  const { updatedItems, stats, accounting } = mergePortfolioData(existingItems, projectAssetMap);

  // 7. Validate updated dataset schema and project integrity
  validatePortfolioData(updatedItems, existingItems);
  console.log(`[Cloudinary Sync] Dataset validation passed (${updatedItems.length} valid projects).`);

  // 8. Write dataset if not in dry-run mode
  if (!dryRun) {
    writeDatasetSafely(dataPath, updatedItems);
    console.log(`[Cloudinary Sync] Successfully wrote updated dataset to ${path.basename(dataPath)}.`);
  } else {
    console.log(`[Cloudinary Sync] Dry-run complete. No file modifications written.`);
  }

  const endTime = new Date().toISOString();

  // 9. Structured summary
  const summary = {
    status: 'SUCCESS',
    startTime,
    endTime,
    pagesRequested: discoveryStats.pagesRequested,
    pagesRetrieved: discoveryStats.pagesRetrieved,
    totalAssetsDiscovered: discoveryStats.totalDiscovered,
    validUniqueAssets: discoveryStats.validUniqueAssets,
    duplicateAssets: discoveryStats.duplicateAssets,
    malformedAssets: discoveryStats.malformedAssets,
    eligibleAssets: groupAccounting.eligible,
    mappedPublishedAssets: accounting.mappedAssets.length,
    pendingUnmatchedAssets: stats.unmatchedAssets,
    excludedAssets: groupAccounting.excluded.length,
    existingProjects: stats.totalExisting,
    matchedProjects: stats.matchedProjects,
    updatedProjects: stats.updatedProjects,
    unchangedProjects: stats.unchangedProjects,
    pendingProjectsCount: stats.newProjectsPending,
    datasetValidation: 'PASSED',
  };

  console.log('[Cloudinary Sync] --- Summary ---');
  console.log(`  Status:                 ${summary.status}`);
  console.log(`  Pages Retrieved:        ${summary.pagesRetrieved} / ${summary.pagesRequested}`);
  console.log(`  Discovered Assets:      ${summary.totalAssetsDiscovered}`);
  console.log(`  Valid Unique:           ${summary.validUniqueAssets}`);
  console.log(`  Duplicate Assets:       ${summary.duplicateAssets}`);
  console.log(`  Eligible for Portfolio: ${summary.eligibleAssets}`);
  console.log(`  Mapped / Published:     ${summary.mappedPublishedAssets}`);
  console.log(`  Pending / Unmatched:    ${summary.pendingUnmatchedAssets}`);
  console.log(`  Excluded Standalone:    ${summary.excludedAssets}`);
  console.log(`  Existing Projects:      ${summary.existingProjects}`);
  console.log(`  Matched Projects:       ${summary.matchedProjects}`);
  console.log(`  Updated Projects:       ${summary.updatedProjects}`);
  console.log(`  Unchanged Projects:     ${summary.unchangedProjects}`);
  console.log(`  Pending New Projects:   ${summary.pendingProjectsCount}`);
  console.log(`  Dataset Integrity:      ${summary.datasetValidation}`);

  if (groupAccounting.excluded.length > 0) {
    console.log('[Cloudinary Sync] Excluded assets:');
    groupAccounting.excluded.forEach((ex) => console.log(`   - ${ex.public_id} (${ex.reason})`));
  }
  if (accounting.pendingProjects.length > 0) {
    console.log('[Cloudinary Sync] Pending projects awaiting metadata:');
    accounting.pendingProjects.forEach((p) => console.log(`   - Folder "${p.projectId}" (${p.assetCount} assets)`));
  }

  return { assets, updatedItems, stats, summary };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  runSync({ dryRun: isDryRun })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[Cloudinary Sync Error] ${err.message}`);
      process.exit(1);
    });
}
