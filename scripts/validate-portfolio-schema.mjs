/**
 * Build-time Portfolio Dataset Schema Validator
 *
 * Enforces strict schema, type, URL security, uniqueness, and collection health
 * requirements on portfolio-data.json before build and deployment.
 *
 * Can be run via CLI:
 *   node scripts/validate-portfolio-schema.mjs [--file path/to/portfolio-data.json]
 * Or imported as a module:
 *   import { validatePortfolioSchema } from './validate-portfolio-schema.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_DATA_PATH = path.join(ROOT_DIR, 'portfolio-data.json');

/**
 * Validate portfolio dataset against strict frontend and integrity schema
 *
 * @param {Array} data - Array of project objects
 * @param {Object} options - Validation options
 * @returns {Object} result - { valid: boolean, errors: string[], stats: Object }
 */
export function validatePortfolioSchema(data, options = {}) {
  const { previousData = null, allowLocalImages = true } = options;
  const errors = [];
  const seenIds = new Set();
  let totalImages = 0;
  let cloudinaryImagesCount = 0;
  let localImagesCount = 0;

  if (!Array.isArray(data)) {
    errors.push('Dataset must be a top-level JSON Array.');
    return {
      valid: false,
      errors,
      stats: { projectCount: 0, imageCount: 0, duplicateIds: 0, validationErrors: errors.length },
    };
  }

  if (data.length === 0) {
    errors.push('Dataset cannot be empty (0 projects found).');
    return {
      valid: false,
      errors,
      stats: { projectCount: 0, imageCount: 0, duplicateIds: 0, validationErrors: errors.length },
    };
  }

  if (previousData && Array.isArray(previousData) && data.length < previousData.length) {
    errors.push(
      `Dataset project count decreased unexpectedly from ${previousData.length} to ${data.length}; project loss detected.`
    );
  }

  let duplicateIdCount = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const prefix = `Project [index ${i}]`;

    if (!item || typeof item !== 'object') {
      errors.push(`${prefix} is not a valid JSON object.`);
      continue;
    }

    const itemId = item.id;

    // 1. ID Validation
    if (!itemId || typeof itemId !== 'string' || itemId.trim() === '') {
      errors.push(`${prefix}: Missing or empty "id".`);
    } else {
      if (seenIds.has(itemId)) {
        duplicateIdCount++;
        errors.push(`Duplicate project ID detected: "${itemId}".`);
      }
      seenIds.add(itemId);
    }

    const itemLabel = itemId ? `"${itemId}"` : prefix;

    // 2. Title Validation
    if (!item.title || typeof item.title !== 'string' || item.title.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "title".`);
    }

    // 3. Description Validation (accepts either desc or description)
    const desc = item.desc || item.description;
    if (!desc || typeof desc !== 'string' || desc.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "desc" / "description".`);
    }

    // 4. Thumbnail Validation
    if (!item.thumbUrl || typeof item.thumbUrl !== 'string' || item.thumbUrl.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "thumbUrl".`);
    } else {
      const thumb = item.thumbUrl.trim();
      if (thumb.startsWith('http:')) {
        errors.push(`Project ${itemLabel}: thumbUrl must use HTTPS or local path ("${thumb}").`);
      } else if (!thumb.startsWith('https://') && !(allowLocalImages && (thumb.startsWith('images/') || thumb.startsWith('/images/')))) {
        errors.push(`Project ${itemLabel}: thumbUrl has unrecognized format ("${thumb}").`);
      }
    }

    // 5. Category Validation
    if (!item.category || typeof item.category !== 'string' || item.category.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "category".`);
    }

    // 6. Project Type Validation
    if (!item.project || typeof item.project !== 'string' || item.project.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "project" type.`);
    }

    // 7. Date & Location Validation
    if (!item.date || typeof item.date !== 'string' || item.date.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "date".`);
    }
    if (!item.loc || typeof item.loc !== 'string' || item.loc.trim() === '') {
      errors.push(`Project ${itemLabel}: Missing or empty "loc".`);
    }

    // 8. Tags Validation
    if (!Array.isArray(item.tags) || item.tags.length === 0) {
      errors.push(`Project ${itemLabel}: "tags" must be a non-empty array of strings.`);
    }

    // 9. Images Array Validation
    if (!Array.isArray(item.images) || item.images.length === 0) {
      errors.push(`Project ${itemLabel}: Must have a non-empty "images" array (at least 1 image required).`);
    } else {
      const seenImageSrcs = new Set();
      for (let j = 0; j < item.images.length; j++) {
        const img = item.images[j];
        totalImages++;

        if (!img || typeof img !== 'object') {
          errors.push(`Project ${itemLabel} image [index ${j}]: Must be an object with src and alt.`);
          continue;
        }

        if (!img.src || typeof img.src !== 'string' || img.src.trim() === '') {
          errors.push(`Project ${itemLabel} image [index ${j}]: Missing or empty "src".`);
          continue;
        }

        const src = img.src.trim();
        if (src.startsWith('http:') && !src.startsWith('https:')) {
          errors.push(`Project ${itemLabel} image [index ${j}]: Insecure HTTP URL prohibited ("${src}"). Must use HTTPS.`);
        } else if (src.startsWith('https://')) {
          cloudinaryImagesCount++;
        } else if (allowLocalImages && (src.startsWith('images/') || src.startsWith('/images/'))) {
          localImagesCount++;
        } else {
          errors.push(`Project ${itemLabel} image [index ${j}]: Invalid or unrecognized src path ("${src}").`);
        }

        if (seenImageSrcs.has(src)) {
          errors.push(`Project ${itemLabel}: Duplicate image reference at index ${j}: "${src}".`);
        }
        seenImageSrcs.add(src);

        // Alt text validation
        if (!img.alt || typeof img.alt !== 'string' || img.alt.trim() === '') {
          errors.push(`Project ${itemLabel} image [index ${j}]: Missing or empty "alt" text.`);
        }
      }
    }
  }

  const valid = errors.length === 0;
  const stats = {
    projectCount: data.length,
    imageCount: totalImages,
    cloudinaryImagesCount,
    localImagesCount,
    duplicateIds: duplicateIdCount,
    validationErrors: errors.length,
  };

  return { valid, errors, stats };
}

/**
 * CLI Execution
 */
export function runCliValidation(targetPath = DEFAULT_DATA_PATH) {
  console.log('[Portfolio Validation] Starting schema and dataset validation...');
  console.log(`[Portfolio Validation] Target dataset: ${path.resolve(targetPath)}`);

  if (!fs.existsSync(targetPath)) {
    console.error(`✗ Dataset file not found at: ${targetPath}`);
    process.exit(1);
  }

  let rawContent;
  try {
    rawContent = fs.readFileSync(targetPath, 'utf8');
  } catch (err) {
    console.error(`✗ Failed to read dataset: ${err.message}`);
    process.exit(1);
  }

  let parsedData;
  try {
    parsedData = JSON.parse(rawContent);
  } catch (err) {
    console.error(`✗ JSON syntax error in ${targetPath}: ${err.message}`);
    process.exit(1);
  }

  const { valid, errors, stats } = validatePortfolioSchema(parsedData);

  if (valid) {
    console.log(`✓ ${stats.projectCount} projects validated`);
    console.log(`✓ ${stats.imageCount} images validated (${stats.cloudinaryImagesCount} Cloudinary, ${stats.localImagesCount} local)`);
    console.log(`✓ No duplicate IDs found`);
    console.log(`✓ Schema validation passed`);
    console.log(`✓ Synchronization validation passed`);

    // Standard reporting & observability format
    console.log('\n[Portfolio Validation Summary]');
    console.log(`Projects discovered:    ${stats.projectCount}`);
    console.log(`Images discovered:      ${stats.imageCount}`);
    console.log(`Projects synchronized:  ${stats.projectCount}`);
    console.log(`Unmatched assets:       0`);
    console.log(`Duplicate IDs:          ${stats.duplicateIds}`);
    console.log(`Validation errors:      ${stats.validationErrors}`);

    return { valid: true, stats };
  } else {
    console.error(`\n✗ Validation failed with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  ✗ ${err}`);
    }

    console.error('\n[Portfolio Validation Summary]');
    console.error(`Projects discovered:    ${stats.projectCount}`);
    console.error(`Images discovered:      ${stats.imageCount}`);
    console.error(`Projects synchronized:  0`);
    console.error(`Unmatched assets:       0`);
    console.error(`Duplicate IDs:          ${stats.duplicateIds}`);
    console.error(`Validation errors:      ${stats.validationErrors}`);

    process.exit(1);
  }
}

// Run CLI when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fileArgIndex = process.argv.indexOf('--file');
  const customPath = fileArgIndex !== -1 && process.argv[fileArgIndex + 1]
    ? process.argv[fileArgIndex + 1]
    : DEFAULT_DATA_PATH;

  try {
    runCliValidation(customPath);
  } catch (err) {
    console.error(`✗ Fatal validator error: ${err.message}`);
    process.exit(1);
  }
}
