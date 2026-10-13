/**
 * Continuous Integration (CI) Portfolio Fallback Consistency Validator
 *
 * Validates consistency between the runtime JSON dataset (portfolio-data.json)
 * and the static HTML fallback cards (portfolio.html / index.html) used for SEO
 * and no-JavaScript rendering.
 *
 * Detects:
 * - Projects in HTML that do not exist in JSON
 * - Projects in JSON that do not exist in HTML (in strict mode)
 * - Duplicate project IDs in HTML or JSON
 * - Project title drift between HTML and JSON
 *
 * CLI Usage:
 *   node scripts/validate-fallback-consistency.mjs [options]
 *
 * Options:
 *   --mode=strict|relaxed  (default: relaxed)
 *   --html=<path>          (default: portfolio.html)
 *   --json=<path>          (default: portfolio-data.json)
 *   --ignore=<id1,id2>     (comma-separated list of IDs to ignore during migration)
 *   --warn-only            (emit report without exiting with non-zero code)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_JSON_PATH = path.join(ROOT_DIR, 'portfolio-data.json');
export const DEFAULT_HTML_PATH = path.join(ROOT_DIR, 'portfolio.html');

/**
 * Extract static fallback project cards from HTML markup.
 * Extracts project ID, title, category, location, and thumbnail reference.
 *
 * Strategy:
 * 1. Prefer explicit data-id, data-project-id, or id attributes on <article class="pf-card">.
 * 2. Fall back to project folder name derived from image src (images/<id>/... or seia/<id>/...).
 * 3. Fall back to sanitized title.
 */
export function extractHtmlFallbackProjects(htmlContent) {
  if (typeof htmlContent !== 'string') {
    throw new Error('Expected HTML content to be a string');
  }

  const cards = [];
  // Match each <article ... class="...pf-card...">...</article> block
  const cardRegex = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = cardRegex.exec(htmlContent)) !== null) {
    const rawAttrs = match[1];
    const innerContent = match[2];

    // Ensure it has the pf-card class
    if (!/class=["'][^"']*\bpf-card\b[^"']*["']/i.test(rawAttrs)) {
      continue;
    }

    // Extract attributes from <article>
    const dataIdMatch = rawAttrs.match(/\bdata-id=["']([^"']+)["']/i);
    const dataProjectIdMatch = rawAttrs.match(/\bdata-project-id=["']([^"']+)["']/i);
    const idAttrMatch = rawAttrs.match(/\bid=["']([^"']+)["']/i);
    const dataTitleMatch = rawAttrs.match(/\bdata-title=["']([^"']+)["']/i);
    const dataLocMatch = rawAttrs.match(/\bdata-loc=["']([^"']+)["']/i);
    const dataCategoryMatch = rawAttrs.match(/\bdata-project=["']([^"']+)["']/i);
    const dataDescMatch = rawAttrs.match(/\bdata-desc=["']([^"']+)["']/i);
    const dataTagsMatch = rawAttrs.match(/\bdata-tags=["']([^"']+)["']/i);
    const featuredMatch = rawAttrs.match(/\bdata-featured=["']true["']/i);

    // Extract elements from innerContent
    const h3Match = innerContent.match(/<h3\b[^>]*class=["'][^"']*\bpf-card__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
    const catSpanMatch = innerContent.match(/<span\b[^>]*class=["'][^"']*\bpf-card__cat\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const locSpanMatch = innerContent.match(/<span\b[^>]*class=["'][^"']*\bpf-card__loc\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const imgMatch = innerContent.match(/<img\b[^>]*src=["']([^"']+)["']/i);

    const thumbUrl = imgMatch ? imgMatch[1].trim() : null;

    // Derive stable project identifier from thumbnail folder if explicit attribute is absent
    let derivedThumbId = null;
    if (thumbUrl) {
      const localFolderMatch = thumbUrl.match(/^images\/([^/]+)\//);
      if (localFolderMatch) {
        derivedThumbId = localFolderMatch[1];
      }
      const cloudFolderMatch = thumbUrl.match(/seia\/([^/]+)\//);
      if (cloudFolderMatch) {
        derivedThumbId = decodeURIComponent(cloudFolderMatch[1]);
      }
    }

    const title = (dataTitleMatch ? dataTitleMatch[1] : (h3Match ? h3Match[1] : '')).trim();
    const explicitId = dataIdMatch
      ? dataIdMatch[1]
      : (dataProjectIdMatch ? dataProjectIdMatch[1] : (idAttrMatch ? idAttrMatch[1] : null));

    const id = explicitId || derivedThumbId || (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : null);

    const category = (dataCategoryMatch ? dataCategoryMatch[1] : (catSpanMatch ? catSpanMatch[1] : '')).trim();
    const loc = (dataLocMatch ? dataLocMatch[1] : (locSpanMatch ? locSpanMatch[1] : '')).trim();
    const desc = dataDescMatch ? dataDescMatch[1].trim() : '';
    const tags = dataTagsMatch ? dataTagsMatch[1].trim() : '';

    cards.push({
      id,
      title,
      category,
      loc,
      thumbUrl,
      desc,
      tags,
      featured: Boolean(featuredMatch),
      hasExplicitId: Boolean(explicitId),
    });
  }

  return cards;
}

/**
 * Compare extracted HTML fallback cards against the JSON dataset.
 *
 * Policies:
 * - Strict Mode: Requires 1:1 project equality between JSON and HTML.
 * - Relaxed Mode (Featured Subset): HTML is an intentional subset of JSON;
 *   every fallback project must exist in JSON, but not all JSON projects must be in HTML.
 */
export function compareFallbackConsistency(jsonData, htmlProjects, options = {}) {
  const {
    mode = 'relaxed',
    ignoreIds = [],
    titleStrict = false,
  } = options;

  const ignoredSet = new Set(ignoreIds);
  const jsonMap = new Map();
  const duplicateJsonIds = [];
  const seenJsonIds = new Set();

  for (const item of jsonData) {
    if (!item || !item.id) continue;
    if (seenJsonIds.has(item.id)) {
      duplicateJsonIds.push(item.id);
    }
    seenJsonIds.add(item.id);
    jsonMap.set(item.id, item);
  }

  const htmlMap = new Map();
  const duplicateHtmlIds = [];
  const seenHtmlIds = new Set();

  for (const card of htmlProjects) {
    if (!card || !card.id) continue;
    if (seenHtmlIds.has(card.id)) {
      duplicateHtmlIds.push(card.id);
    }
    seenHtmlIds.add(card.id);
    htmlMap.set(card.id, card);
  }

  // 1. Missing in JSON (HTML fallback has projects that do not exist in JSON dataset)
  const missingInJson = [];
  for (const card of htmlProjects) {
    if (ignoredSet.has(card.id)) continue;
    if (!jsonMap.has(card.id)) {
      missingInJson.push({
        id: card.id,
        title: card.title,
        thumbUrl: card.thumbUrl,
      });
    }
  }

  // 2. Missing in HTML
  // In strict mode, every JSON project must exist in HTML.
  // In relaxed mode, HTML is an allowed subset of JSON.
  const missingInHtml = [];
  if (mode === 'strict') {
    for (const item of jsonData) {
      if (ignoredSet.has(item.id)) continue;
      if (!htmlMap.has(item.id)) {
        missingInHtml.push({
          id: item.id,
          title: item.title,
        });
      }
    }
  }

  // 3. Title Differences
  const titleDifferences = [];
  for (const card of htmlProjects) {
    if (ignoredSet.has(card.id)) continue;
    const jsonItem = jsonMap.get(card.id);
    if (!jsonItem) continue;

    const htmlTitle = card.title.trim();
    const jsonTitle = (jsonItem.title || '').trim();

    const matches = titleStrict
      ? htmlTitle === jsonTitle
      : htmlTitle.toLowerCase() === jsonTitle.toLowerCase();

    if (!matches) {
      titleDifferences.push({
        id: card.id,
        htmlTitle,
        jsonTitle,
      });
    }
  }

  const passed =
    missingInJson.length === 0 &&
    (mode === 'relaxed' || missingInHtml.length === 0) &&
    duplicateJsonIds.length === 0 &&
    duplicateHtmlIds.length === 0 &&
    titleDifferences.length === 0;

  return {
    passed,
    mode,
    stats: {
      jsonCount: jsonData.length,
      htmlCount: htmlProjects.length,
      missingInHtmlCount: missingInHtml.length,
      missingInJsonCount: missingInJson.length,
      duplicateJsonIdsCount: duplicateJsonIds.length,
      duplicateHtmlIdsCount: duplicateHtmlIds.length,
      duplicateTotalCount: duplicateJsonIds.length + duplicateHtmlIds.length,
      titleDifferencesCount: titleDifferences.length,
    },
    missingInHtml,
    missingInJson,
    duplicateJsonIds,
    duplicateHtmlIds,
    titleDifferences,
  };
}

/**
 * Format human-readable CI report.
 */
export function formatConsistencyReport(result) {
  const { passed, stats, missingInHtml, missingInJson, duplicateJsonIds, duplicateHtmlIds, titleDifferences } = result;

  const lines = [
    'Portfolio Fallback Consistency Report',
    '',
    'JSON Projects:',
    String(stats.jsonCount),
    '',
    'HTML Projects:',
    String(stats.htmlCount),
    '',
    'Missing In HTML:',
    String(stats.missingInHtmlCount),
  ];

  if (missingInHtml.length > 0) {
    for (const item of missingInHtml) {
      lines.push(` - ${item.id}${item.title ? ` ("${item.title}")` : ''}`);
    }
  }

  lines.push('', 'Missing In JSON:', String(stats.missingInJsonCount));
  if (missingInJson.length > 0) {
    for (const item of missingInJson) {
      lines.push(` - ${item.id}${item.title ? ` ("${item.title}")` : ''}`);
    }
  }

  lines.push('', 'Duplicate IDs:', String(stats.duplicateJsonIdsCount));
  if (duplicateJsonIds.length > 0 || duplicateHtmlIds.length > 0) {
    duplicateJsonIds.forEach((id) => lines.push(` - JSON duplicate: ${id}`));
    duplicateHtmlIds.forEach((id) => lines.push(` - HTML duplicate: ${id}`));
  }

  lines.push('', 'Title Differences:', String(stats.titleDifferencesCount));
  if (titleDifferences.length > 0) {
    for (const diff of titleDifferences) {
      lines.push(` - [${diff.id}] JSON: "${diff.jsonTitle}" vs HTML: "${diff.htmlTitle}"`);
    }
  }

  lines.push('', 'Status:', passed ? 'PASSED' : 'FAILED');
  return lines.join('\n');
}

/**
 * CLI Runner
 */
export function runFallbackValidationCli(argv = process.argv) {
  const getArg = (prefix) => {
    const item = argv.find((a) => a.startsWith(prefix));
    return item ? item.split('=')[1] : null;
  };

  const jsonPath = getArg('--json') || DEFAULT_JSON_PATH;
  const htmlPath = getArg('--html') || DEFAULT_HTML_PATH;
  const mode = getArg('--mode') || process.env.FALLBACK_VALIDATION_MODE || 'relaxed';
  const ignoreArg = getArg('--ignore');
  const ignoreIds = ignoreArg ? ignoreArg.split(',').map((s) => s.trim()) : [];
  const warnOnly = argv.includes('--warn-only') || process.env.FALLBACK_WARN_ONLY === 'true';

  if (!fs.existsSync(jsonPath)) {
    console.error(`✗ JSON dataset not found at: ${jsonPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(htmlPath)) {
    console.error(`✗ HTML file not found at: ${htmlPath}`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  const jsonData = JSON.parse(rawJson);

  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const htmlProjects = extractHtmlFallbackProjects(rawHtml);

  const comparison = compareFallbackConsistency(jsonData, htmlProjects, {
    mode,
    ignoreIds,
  });

  const report = formatConsistencyReport(comparison);
  console.log(report);

  if (!comparison.passed && !warnOnly) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Direct invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFallbackValidationCli();
}
