/**
 * Build-time Component Partial Stitching Utility
 *
 * Compiles standalone HTML component partials directly into index.html:
 *   - about.html
 *   - portfolio.html
 *   - contact.html
 *   - footer.html
 *
 * DESIGN CONSTRAINTS & GUARANTEES:
 * 1. Safe preview by default (--dry-run). Modifies index.html only when --write is passed.
 * 2. Idempotent: Repeated execution produces identical, deterministic output.
 * 3. Strict Marker Validation: Ensures all marker pairs exist, are ordered, and unambiguous.
 * 4. Fragment Validation: Rejects full document tags (<!DOCTYPE>, <html>, <head>, <body>).
 * 5. Atomic Writing: Writes to a temporary file (.tmp) and verifies before renaming.
 * 6. Preserves all surrounding metadata, scripts, stylesheets, and fallback content.
 *
 * CLI Usage:
 *   node scripts/stitch-components.mjs [--dry-run] [--write] [--index=<path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DEFAULT_INDEX_PATH = path.join(ROOT_DIR, 'index.html');

/**
 * Partial configuration definitions
 */
export const PARTIAL_DEFINITIONS = Object.freeze([
  {
    name: 'about.html',
    filePath: path.join(ROOT_DIR, 'about.html'),
    containerId: 'about',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: about.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: about.html -->',
    indentSpaces: 8,
  },
  {
    name: 'portfolio.html',
    filePath: path.join(ROOT_DIR, 'portfolio.html'),
    containerId: 'portfolio',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: portfolio.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: portfolio.html -->',
    indentSpaces: 8,
  },
  {
    name: 'contact.html',
    filePath: path.join(ROOT_DIR, 'contact.html'),
    containerId: 'contact',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: contact.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: contact.html -->',
    indentSpaces: 8,
  },
  {
    name: 'footer.html',
    filePath: path.join(ROOT_DIR, 'footer.html'),
    containerId: 'footer',
    startMarker: '<!-- BEGIN GENERATED PARTIAL: footer.html -->',
    endMarker: '<!-- END GENERATED PARTIAL: footer.html -->',
    indentSpaces: 6,
  },
]);

/**
 * Validate that markers in index.html are complete, correctly ordered, and non-overlapping.
 *
 * @param {string} htmlContent - Content of index.html
 * @param {Array} definitions - List of partial definitions
 * @returns {{ valid: boolean, errors: string[], positions: Map }}
 */
export function validateMarkers(htmlContent, definitions = PARTIAL_DEFINITIONS) {
  const errors = [];
  const positions = new Map();

  if (typeof htmlContent !== 'string') {
    errors.push('index.html content must be a string');
    return { valid: false, errors, positions };
  }

  const ranges = [];

  for (const def of definitions) {
    const startCount = (htmlContent.match(new RegExp(escapeRegExp(def.startMarker), 'g')) || []).length;
    const endCount = (htmlContent.match(new RegExp(escapeRegExp(def.endMarker), 'g')) || []).length;

    if (startCount === 0) {
      errors.push(`Missing start marker for ${def.name}: "${def.startMarker}"`);
    } else if (startCount > 1) {
      errors.push(`Duplicate start marker for ${def.name} (${startCount} occurrences found)`);
    }

    if (endCount === 0) {
      errors.push(`Missing end marker for ${def.name}: "${def.endMarker}"`);
    } else if (endCount > 1) {
      errors.push(`Duplicate end marker for ${def.name} (${endCount} occurrences found)`);
    }

    if (startCount === 1 && endCount === 1) {
      const startIndex = htmlContent.indexOf(def.startMarker);
      const endIndex = htmlContent.indexOf(def.endMarker);

      if (startIndex >= endIndex) {
        errors.push(`Reversed markers for ${def.name}: start marker appears after end marker`);
      } else {
        positions.set(def.name, {
          startIndex,
          endIndex,
          contentStart: startIndex + def.startMarker.length,
          contentEnd: endIndex,
        });
        ranges.push({ name: def.name, start: startIndex, end: endIndex + def.endMarker.length });
      }
    }
  }

  // Check for overlapping ranges
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].end > ranges[i + 1].start) {
      errors.push(`Overlapping partial regions detected between "${ranges[i].name}" and "${ranges[i + 1].name}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    positions,
  };
}

/**
 * Validate and format an HTML partial fragment for embedding.
 *
 * @param {string} rawContent - Raw HTML from partial file
 * @param {Object} definition - Partial definition object
 * @returns {string} - Cleaned, formatted fragment
 */
export function formatPartialFragment(rawContent, definition) {
  if (typeof rawContent !== 'string') {
    throw new Error(`Partial content for ${definition.name} must be a string`);
  }

  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw new Error(`Partial file ${definition.name} is empty`);
  }

  // Guard against accidental full-document insertions
  if (/<!DOCTYPE\b|<html\b|<head\b|<body\b/i.test(trimmed)) {
    throw new Error(
      `Partial file ${definition.name} contains invalid document-level tags (<!DOCTYPE>, <html>, <head>, or <body>)`
    );
  }

  // Guard against duplicate ID if child element has the same ID as the parent container
  let cleaned = trimmed;
  if (definition.containerId) {
    const dupIdRegex = new RegExp(
      `^(<[a-zA-Z0-9_-]+)\\s+id=["']${escapeRegExp(definition.containerId)}["']`,
      'i'
    );
    cleaned = cleaned.replace(dupIdRegex, '$1');
  }

  // Normalize indentation to preserve clean markup in index.html
  const indent = ' '.repeat(definition.indentSpaces || 8);
  const lines = cleaned.split(/\r?\n/);
  const indented = lines.map((line) => (line.length > 0 ? `${indent}${line}` : '')).join('\n');

  return indented;
}

/**
 * Stitch partials into index.html string in memory.
 *
 * @param {string} indexContent - Original content of index.html
 * @param {Map<string, string>} partialsMap - Map of partial filename to raw content
 * @param {Array} definitions - List of partial definitions
 * @returns {string} - Stitched HTML content
 */
export function stitchHtml(indexContent, partialsMap, definitions = PARTIAL_DEFINITIONS) {
  const markerCheck = validateMarkers(indexContent, definitions);
  if (!markerCheck.valid) {
    throw new Error(`Marker validation failed:\n  - ${markerCheck.errors.join('\n  - ')}`);
  }

  let result = indexContent;

  for (const def of definitions) {
    const rawPartial = partialsMap.get(def.name);
    if (typeof rawPartial !== 'string') {
      throw new Error(`Missing content for required partial: ${def.name}`);
    }

    const formattedFragment = formatPartialFragment(rawPartial, def);

    // Re-locate markers in result string (as previous replacements may shift offsets)
    const startIdx = result.indexOf(def.startMarker);
    const endIdx = result.indexOf(def.endMarker);

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      throw new Error(`Failed to locate markers for ${def.name} during stitching pass`);
    }

    const before = result.slice(0, startIdx + def.startMarker.length);
    const after = result.slice(endIdx);

    // Insert formatted fragment between startMarker and endMarker
    result = `${before}\n${formattedFragment}\n${' '.repeat(Math.max(0, (def.indentSpaces || 8) - 2))}${after.trimStart()}`;
  }

  return result;
}

/**
 * Execute component stitching workflow
 *
 * @param {Object} options
 * @param {boolean} [options.write=false] - Whether to write changes to disk
 * @param {string} [options.indexFilePath] - Path to index.html
 * @param {Array} [options.definitions] - Partial definitions
 * @returns {Promise<Object>} Execution summary
 */
export async function runStitch(options = {}) {
  const {
    write = false,
    indexFilePath = DEFAULT_INDEX_PATH,
    definitions = PARTIAL_DEFINITIONS,
  } = options;

  console.log(`[Component Stitching] Starting component stitching (mode: ${write ? 'WRITE' : 'DRY-RUN'})...`);

  if (!fs.existsSync(indexFilePath)) {
    throw new Error(`Target HTML file not found: ${indexFilePath}`);
  }

  const originalIndexHtml = fs.readFileSync(indexFilePath, 'utf8');

  // Load all required partials
  const partialsMap = new Map();
  for (const def of definitions) {
    if (!fs.existsSync(def.filePath)) {
      throw new Error(`Required partial file not found: ${def.filePath}`);
    }
    const content = fs.readFileSync(def.filePath, 'utf8');
    partialsMap.set(def.name, content);
    console.log(`  ✓ Loaded partial ${def.name} (${content.length} bytes)`);
  }

  // Perform in-memory stitching
  const stitchedHtml = stitchHtml(originalIndexHtml, partialsMap, definitions);

  // Validate resulting document
  if (!stitchedHtml || stitchedHtml.length < 1000) {
    throw new Error('Generated HTML appears truncated or empty; aborting without writing.');
  }

  const postValidation = validateMarkers(stitchedHtml, definitions);
  if (!postValidation.valid) {
    throw new Error(
      `Post-stitching marker validation failed; aborting:\n  - ${postValidation.errors.join('\n  - ')}`
    );
  }

  // Idempotency check: verify re-stitching produces exact identical output
  const secondPassHtml = stitchHtml(stitchedHtml, partialsMap, definitions);
  if (stitchedHtml !== secondPassHtml) {
    throw new Error('Idempotency failure: running second stitching pass produced different output.');
  }

  const isChanged = originalIndexHtml !== stitchedHtml;

  if (write) {
    if (isChanged) {
      // Atomic write pattern: write to .tmp and rename
      const tempPath = `${indexFilePath}.tmp-${Date.now()}`;
      try {
        fs.writeFileSync(tempPath, stitchedHtml, 'utf8');
        const written = fs.readFileSync(tempPath, 'utf8');
        if (written.length !== stitchedHtml.length) {
          throw new Error('Temporary file verification failed (size mismatch)');
        }
        fs.renameSync(tempPath, indexFilePath);
        console.log(`[Component Stitching] Successfully updated ${path.basename(indexFilePath)} atomically.`);
      } catch (writeErr) {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw new Error(`Atomic write failed: ${writeErr.message}`);
      }
    } else {
      console.log(`[Component Stitching] ${path.basename(indexFilePath)} is already completely up-to-date.`);
    }
  } else {
    console.log(
      `[Component Stitching] Dry-run complete. ${isChanged ? 'index.html would be updated.' : 'index.html is already up-to-date.'}`
    );
  }

  const summary = {
    mode: write ? 'WRITE' : 'DRY-RUN',
    status: 'SUCCESS',
    partialsStitched: definitions.length,
    changed: isChanged,
    originalBytes: originalIndexHtml.length,
    stitchedBytes: stitchedHtml.length,
  };

  console.log('[Component Stitching] Summary:');
  console.log(`  Mode:              ${summary.mode}`);
  console.log(`  Status:            ${summary.status}`);
  console.log(`  Partials Stitched: ${summary.partialsStitched}`);
  console.log(`  Modified:          ${summary.changed}`);
  console.log(`  Size (bytes):      ${summary.originalBytes} -> ${summary.stitchedBytes}`);

  return summary;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isWrite = process.argv.includes('--write');
  const indexArg = process.argv.find((arg) => arg.startsWith('--index='));
  const indexFilePath = indexArg ? indexArg.split('=')[1] : DEFAULT_INDEX_PATH;

  runStitch({ write: isWrite, indexFilePath })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[Component Stitching Error] ${err.message}`);
      process.exit(1);
    });
}
