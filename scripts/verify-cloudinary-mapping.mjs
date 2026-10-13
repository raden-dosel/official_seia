/**
 * Cloudinary Folder Convention & Project Grouping Verification Utility
 *
 * Confirms that the actual Cloudinary account structure matches the assumptions
 * made by the portfolio synchronization process:
 * 1. Analyzes actual folder hierarchy against seia/<project-id>/<filename> convention.
 * 2. Validates project grouping accuracy using groupAssetsByProject().
 * 3. Detects orphan assets (root files, unassigned assets, invalid paths).
 * 4. Detects ambiguous project structures (deep nesting, case collisions).
 * 5. Evaluates metadata availability and coverage percentages.
 * 6. Categorizes resource types (image vs video vs unsupported).
 * 7. Verifies deterministic mapping stability.
 *
 * Can be run via CLI:
 *   node scripts/verify-cloudinary-mapping.mjs [--prefix=seia] [--allow-warnings]
 * Or imported as a module:
 *   import { verifyCloudinaryMapping } from './verify-cloudinary-mapping.mjs';
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEnvironment,
  fetchCloudinaryAssets,
  groupAssetsByProject,
} from './sync-cloudinary-portfolio.mjs';

/**
 * Verify Cloudinary mapping against real or provided asset inventory
 */
export async function verifyCloudinaryMapping(options = {}) {
  const {
    env = process.env,
    fetchFn = globalThis.fetch,
    assets: providedAssets = null,
    prefix = 'seia',
    allowWarnings = true,
  } = options;

  let assets = providedAssets;

  // 1. Fetch live assets from Cloudinary if not provided
  if (!assets) {
    const credentials = validateEnvironment(env);
    assets = await fetchCloudinaryAssets({ ...credentials, prefix }, fetchFn);
  }

  // 2. Resource Type Breakdown
  const assetTypes = {
    image: 0,
    video: 0,
    raw: 0,
    unsupported: 0,
    details: [],
  };

  for (const asset of assets) {
    const resType = asset.resource_type || 'image';
    if (resType === 'image') {
      assetTypes.image++;
    } else if (resType === 'video') {
      assetTypes.video++;
      assetTypes.details.push({ public_id: asset.public_id, type: resType });
    } else if (resType === 'raw') {
      assetTypes.raw++;
      assetTypes.details.push({ public_id: asset.public_id, type: resType });
    } else {
      assetTypes.unsupported++;
      assetTypes.details.push({ public_id: asset.public_id, type: resType });
    }
  }

  // 3. Folder Hierarchy & Orphan Detection
  const hierarchy = new Map();
  const orphans = [];
  const ambiguous = {
    nestedFolders: [],
    caseCollisions: [],
  };

  const seenLowerProjectIds = new Map();

  for (const asset of assets) {
    const publicId = asset.public_id || '';
    const parts = publicId.split('/');

    // Check prefix
    if (parts.length < 2 || parts[0] !== prefix) {
      orphans.push({
        public_id: publicId,
        reason: `Asset outside root prefix folder "${prefix}"`,
      });
      continue;
    }

    // Direct file in prefix root: seia/image.jpg
    if (parts.length === 2) {
      orphans.push({
        public_id: publicId,
        reason: `Orphan asset located directly in root folder "${prefix}" without a project subfolder`,
      });
      continue;
    }

    const projectId = parts[1];

    // Check case collisions: project-a vs Project-A
    const lowerId = projectId.toLowerCase();
    if (seenLowerProjectIds.has(lowerId) && seenLowerProjectIds.get(lowerId) !== projectId) {
      ambiguous.caseCollisions.push({
        existingId: seenLowerProjectIds.get(lowerId),
        conflictingId: projectId,
        public_id: publicId,
      });
    } else {
      seenLowerProjectIds.set(lowerId, projectId);
    }

    // Check deep nesting: seia/project-a/subfolder/img.jpg
    if (parts.length > 3) {
      const subpath = parts.slice(2, -1).join('/');
      ambiguous.nestedFolders.push({
        public_id: publicId,
        projectId,
        subpath,
        reason: `Deeply nested folder path "${subpath}" detected inside project "${projectId}"`,
      });
    }

    if (!hierarchy.has(projectId)) {
      hierarchy.set(projectId, []);
    }
    hierarchy.get(projectId).push(asset);
  }

  // 4. Project Grouping Verification
  const projectMap = groupAssetsByProject(assets, prefix);
  const projectsDiscovered = hierarchy.size;
  const projectsGrouped = projectMap.size;
  const groupingFailures = [];

  for (const [projId, expectedAssets] of hierarchy.entries()) {
    const grouped = projectMap.get(projId);
    if (!grouped || grouped.length !== expectedAssets.length) {
      groupingFailures.push({
        projectId: projId,
        expectedCount: expectedAssets.length,
        actualCount: grouped ? grouped.length : 0,
      });
    }
  }

  // 5. Metadata Availability Analysis
  const totalAssets = assets.length;
  const metadataFields = {
    secureUrl: 0,
    dimensions: 0,
    createdAt: 0,
    format: 0,
    folder: 0,
    tags: 0,
    context: 0,
  };

  for (const asset of assets) {
    if (asset.secure_url) metadataFields.secureUrl++;
    if (asset.width && asset.height) metadataFields.dimensions++;
    if (asset.created_at) metadataFields.createdAt++;
    if (asset.format) metadataFields.format++;
    if (asset.folder || (asset.public_id && asset.public_id.includes('/'))) metadataFields.folder++;
    if (Array.isArray(asset.tags) && asset.tags.length > 0) metadataFields.tags++;
    if (asset.context && Object.keys(asset.context).length > 0) metadataFields.context++;
  }

  const coveragePercent = (count) => (totalAssets > 0 ? Math.round((count / totalAssets) * 100) : 0);

  const metadataReport = [
    { field: 'Secure URL', count: metadataFields.secureUrl, coverage: coveragePercent(metadataFields.secureUrl), status: 'Required for Delivery' },
    { field: 'Dimensions', count: metadataFields.dimensions, coverage: coveragePercent(metadataFields.dimensions), status: 'Available' },
    { field: 'Created At', count: metadataFields.createdAt, coverage: coveragePercent(metadataFields.createdAt), status: 'Used for Sorting' },
    { field: 'Format', count: metadataFields.format, coverage: coveragePercent(metadataFields.format), status: 'Available' },
    { field: 'Folder', count: metadataFields.folder, coverage: coveragePercent(metadataFields.folder), status: 'Used for Grouping' },
    { field: 'Tags', count: metadataFields.tags, coverage: coveragePercent(metadataFields.tags), status: 'Unused (Curated in JSON)' },
    { field: 'Context', count: metadataFields.context, coverage: coveragePercent(metadataFields.context), status: 'Unused (Curated in JSON)' },
  ];

  // Core essential metadata coverage (URL, dimensions, created_at, format, folder)
  const coreCoverageCount = metadataFields.secureUrl + metadataFields.dimensions + metadataFields.createdAt + metadataFields.format + metadataFields.folder;
  const coreTotalPossible = totalAssets * 5;
  const overallCoverage = coreTotalPossible > 0 ? Math.round((coreCoverageCount / coreTotalPossible) * 100) : 0;

  // 6. Mapping Stability Verification
  const secondPassMap = groupAssetsByProject(assets, prefix);
  let stabilityPassed = true;
  const stabilityErrors = [];

  if (projectMap.size !== secondPassMap.size) {
    stabilityPassed = false;
    stabilityErrors.push('Project count varied between grouping passes');
  } else {
    for (const [id, list1] of projectMap.entries()) {
      const list2 = secondPassMap.get(id);
      if (!list2 || list1.length !== list2.length) {
        stabilityPassed = false;
        stabilityErrors.push(`Asset count for project "${id}" changed between passes`);
        break;
      }
      for (let i = 0; i < list1.length; i++) {
        if (list1[i].public_id !== list2[i].public_id) {
          stabilityPassed = false;
          stabilityErrors.push(`Asset ordering for project "${id}" changed between passes`);
          break;
        }
      }
    }
  }

  // 7. Pass / Warning / Failure Decision
  const criticalFailures = [];
  const warnings = [];

  if (totalAssets === 0) {
    criticalFailures.push(`No assets discovered under prefix "${prefix}"`);
  }
  if (groupingFailures.length > 0) {
    criticalFailures.push(`Project grouping failures detected in ${groupingFailures.length} project(s)`);
  }
  if (ambiguous.caseCollisions.length > 0) {
    criticalFailures.push(`Case normalization collisions detected: ${ambiguous.caseCollisions.length} duplicate project name(s)`);
  }
  if (!stabilityPassed) {
    criticalFailures.push(`Mapping instability detected: ${stabilityErrors.join('; ')}`);
  }

  if (orphans.length > 0) {
    warnings.push(`${orphans.length} orphan asset(s) outside project folders`);
  }
  if (ambiguous.nestedFolders.length > 0) {
    warnings.push(`${ambiguous.nestedFolders.length} asset(s) in nested subfolders`);
  }
  if (assetTypes.video > 0 || assetTypes.unsupported > 0) {
    warnings.push(`${assetTypes.video + assetTypes.unsupported} non-image resource(s) present`);
  }

  let status = 'PASS';
  let folderCompliance = 'PASS';

  if (criticalFailures.length > 0) {
    status = 'FAIL';
    folderCompliance = 'FAIL';
  } else if (warnings.length > 0) {
    status = allowWarnings ? 'WARNING' : 'FAIL';
    folderCompliance = 'WARNING';
  }

  return {
    status,
    passed: criticalFailures.length === 0,
    hasWarnings: warnings.length > 0,
    folderCompliance,
    criticalFailures,
    warnings,
    stats: {
      totalAssets,
      projectsDiscovered,
      projectsGrouped,
      groupingFailuresCount: groupingFailures.length,
      orphanAssetsCount: orphans.length,
      groupingConflictsCount: ambiguous.caseCollisions.length,
      overallCoveragePercent: overallCoverage,
    },
    assetTypes,
    hierarchy,
    orphans,
    ambiguous,
    metadataReport,
    stability: {
      passed: stabilityPassed,
      errors: stabilityErrors,
    },
  };
}

/**
 * Format Human-Readable Verification Report
 */
export function formatVerificationReport(result) {
  const { status, folderCompliance, stats, assetTypes, hierarchy, orphans, ambiguous, metadataReport, criticalFailures, warnings } = result;

  const lines = [
    'Cloudinary Mapping Verification',
    '',
    `Projects Discovered:             ${stats.projectsDiscovered}`,
    `Projects Successfully Grouped:   ${stats.projectsGrouped}`,
    `Total Assets Discovered:         ${stats.totalAssets}`,
    `Image Assets:                    ${assetTypes.image}`,
    `Video Assets:                    ${assetTypes.video}`,
    `Unsupported Assets:              ${assetTypes.unsupported + assetTypes.raw}`,
    `Orphan Assets:                   ${stats.orphanAssetsCount}`,
    `Grouping Conflicts:              ${stats.groupingConflictsCount}`,
    `Metadata Coverage:               ${stats.overallCoveragePercent}%`,
    `Folder Structure Compliance:     ${folderCompliance}`,
    '',
    'Metadata Coverage Details:',
    '| Field        | Coverage | Status                 |',
    '|--------------|----------|------------------------|',
  ];

  for (const m of metadataReport) {
    const fieldPadded = m.field.padEnd(12, ' ');
    const covPadded = `${m.coverage}%`.padEnd(8, ' ');
    lines.push(`| ${fieldPadded} | ${covPadded} | ${m.status.padEnd(22, ' ')} |`);
  }

  lines.push('', 'Folder Hierarchy:');
  if (hierarchy.size === 0) {
    lines.push('  (No projects discovered)');
  } else {
    lines.push('seia/');
    for (const [projId, assetList] of hierarchy.entries()) {
      lines.push(` ├─ ${projId}/ (${assetList.length} assets)`);
    }
  }

  if (orphans.length > 0) {
    lines.push('', 'Orphan Assets:');
    for (const o of orphans) {
      lines.push(` - ${o.public_id} (${o.reason})`);
    }
  }

  if (ambiguous.nestedFolders.length > 0) {
    lines.push('', 'Nested Folder Warnings:');
    for (const n of ambiguous.nestedFolders) {
      lines.push(` - [${n.projectId}] ${n.public_id} (${n.reason})`);
    }
  }

  if (ambiguous.caseCollisions.length > 0) {
    lines.push('', 'Case Collision Conflicts:');
    for (const c of ambiguous.caseCollisions) {
      lines.push(` - Conflict between "${c.existingId}" and "${c.conflictingId}" (${c.public_id})`);
    }
  }

  if (criticalFailures.length > 0) {
    lines.push('', 'Critical Failures:');
    for (const f of criticalFailures) {
      lines.push(` ✗ ${f}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const w of warnings) {
      lines.push(` ⚠ ${w}`);
    }
  }

  lines.push('', `Status: ${status}`);
  return lines.join('\n');
}

/**
 * CLI Runner
 */
export async function runVerificationCli(argv = process.argv) {
  const getArg = (prefix) => {
    const item = argv.find((a) => a.startsWith(prefix));
    return item ? item.split('=')[1] : null;
  };

  const prefix = getArg('--prefix') || 'seia';
  const strictMode = argv.includes('--strict');
  const allowWarnings = !strictMode;

  console.log('[Cloudinary Verification] Inspecting Cloudinary library structure...');

  try {
    const result = await verifyCloudinaryMapping({
      prefix,
      allowWarnings,
    });

    const report = formatVerificationReport(result);
    console.log(report);

    if (result.status === 'FAIL') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error(`✗ Fatal verification error: ${err.message}`);
    process.exit(1);
  }
}

// Direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVerificationCli();
}
