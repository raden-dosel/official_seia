/**
 * Portfolio Modal Touch Gesture Test Suite
 *
 * Verifies mobile swipe gesture detection for the portfolio modal gallery:
 * - Swipe left: next image
 * - Swipe right: previous image
 * - Vertical scrolling preservation (no navigation on vertical/dominant-vertical gestures)
 * - Tap suppression (no navigation on small movements/taps)
 * - Multi-touch cancellation (e.g., pinch-to-zoom)
 * - Duration threshold (suppresses slow drags)
 * - CSS touch-action declarations
 *
 * Uses native Node.js test runner (node:test, node:assert/strict). Zero dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORTFOLIO_JS_PATH = path.join(ROOT_DIR, 'portfolio.js');
const PORTFOLIO_CSS_PATH = path.join(ROOT_DIR, 'portfolio.css');

// Import Portfolio from portfolio.js
await import(`file://${PORTFOLIO_JS_PATH}`);
const {
  evaluateSwipeGesture,
  SWIPE_MIN_DISTANCE_PX,
  SWIPE_MAX_DURATION_MS,
  SWIPE_DOMINANCE_RATIO,
} = globalThis.Portfolio;

test('Touch constants are correctly calibrated', () => {
  assert.equal(typeof SWIPE_MIN_DISTANCE_PX, 'number');
  assert.ok(SWIPE_MIN_DISTANCE_PX >= 30 && SWIPE_MIN_DISTANCE_PX <= 60, 'Threshold should be between 30px and 60px');
  assert.equal(typeof SWIPE_MAX_DURATION_MS, 'number');
  assert.ok(SWIPE_MAX_DURATION_MS >= 500, 'Max duration should allow natural swipe speeds');
  assert.equal(typeof SWIPE_DOMINANCE_RATIO, 'number');
  assert.ok(SWIPE_DOMINANCE_RATIO >= 1.0, 'Horizontal dominance ratio must prevent vertical scroll interference');
});

test('Swipe left triggers "next" image navigation', () => {
  const result = evaluateSwipeGesture({
    startX: 200,
    startY: 150,
    endX: 120, // -80px movement (left)
    endY: 155, // 5px vertical jitter
    startTime: 1000,
    endTime: 1250, // 250ms swipe
  });
  assert.equal(result, 'next', 'Swipe left must trigger next');
});

test('Swipe right triggers "prev" image navigation', () => {
  const result = evaluateSwipeGesture({
    startX: 100,
    startY: 150,
    endX: 180, // +80px movement (right)
    endY: 148, // -2px vertical jitter
    startTime: 1000,
    endTime: 1280,
  });
  assert.equal(result, 'prev', 'Swipe right must trigger prev');
});

test('Vertical swipe does not trigger gallery navigation (preserves normal scroll)', () => {
  // Pure vertical swipe
  const pureVertical = evaluateSwipeGesture({
    startX: 150,
    startY: 100,
    endX: 152,
    endY: 260, // 160px vertical scroll
    startTime: 1000,
    endTime: 1300,
  });
  assert.equal(pureVertical, null, 'Pure vertical gesture must return null');

  // Diagonal swipe with vertical dominance
  const verticalDominant = evaluateSwipeGesture({
    startX: 150,
    startY: 100,
    endX: 200, // +50px horizontal
    endY: 200, // +100px vertical
    startTime: 1000,
    endTime: 1200,
  });
  assert.equal(verticalDominant, null, 'Gesture with vertical dominance must return null');
});

test('Taps and movements below distance threshold do not trigger gallery navigation', () => {
  // Exact tap
  const tap = evaluateSwipeGesture({
    startX: 150,
    startY: 150,
    endX: 150,
    endY: 150,
    startTime: 1000,
    endTime: 1050,
  });
  assert.equal(tap, null, 'Tap must return null');

  // Sub-threshold jitter (e.g. 20px)
  const jitter = evaluateSwipeGesture({
    startX: 150,
    startY: 150,
    endX: 170, // 20px < SWIPE_MIN_DISTANCE_PX
    endY: 150,
    startTime: 1000,
    endTime: 1100,
  });
  assert.equal(jitter, null, 'Sub-threshold gesture must return null');
});

test('Multi-touch gestures (e.g. pinch-to-zoom) are ignored', () => {
  const multiTouch = evaluateSwipeGesture({
    startX: 200,
    startY: 150,
    endX: 100,
    endY: 150,
    startTime: 1000,
    endTime: 1200,
    isMultiTouch: true,
  });
  assert.equal(multiTouch, null, 'Multi-touch gesture must return null');
});

test('Slow drags exceeding maximum duration threshold are discarded', () => {
  const slowDrag = evaluateSwipeGesture({
    startX: 200,
    startY: 150,
    endX: 100, // 100px movement
    endY: 150,
    startTime: 1000,
    endTime: 1000 + SWIPE_MAX_DURATION_MS + 200, // Exceeds max swipe duration
  });
  assert.equal(slowDrag, null, 'Slow drag exceeding duration must return null');
});

test('portfolio.css declares touch-action and user-select on modal carousel', () => {
  assert.ok(fs.existsSync(PORTFOLIO_CSS_PATH), 'portfolio.css must exist');
  const css = fs.readFileSync(PORTFOLIO_CSS_PATH, 'utf8');

  // Verify .pf-carousel has touch-action: pan-y pinch-zoom
  const carouselBlockMatch = css.match(/\.pf-carousel\s*\{([^}]+)\}/);
  assert.ok(carouselBlockMatch, 'Must find .pf-carousel rule');
  const carouselStyles = carouselBlockMatch[1];
  assert.match(carouselStyles, /touch-action:\s*pan-y\s+pinch-zoom/, 'Carousel must declare touch-action: pan-y pinch-zoom');

  // Verify .pf-carousel img has user-select: none and -webkit-user-drag: none
  const imgBlockMatch = css.match(/\.pf-carousel\s+img\s*\{([^}]+)\}/);
  assert.ok(imgBlockMatch, 'Must find .pf-carousel img rule');
  const imgStyles = imgBlockMatch[1];
  assert.match(imgStyles, /user-select:\s*none/, 'Carousel img must have user-select: none');
  assert.match(imgStyles, /-webkit-user-drag:\s*none/, 'Carousel img must have -webkit-user-drag: none');
});

test('portfolio.js registers touch event listeners on the carousel container', () => {
  assert.ok(fs.existsSync(PORTFOLIO_JS_PATH), 'portfolio.js must exist');
  const js = fs.readFileSync(PORTFOLIO_JS_PATH, 'utf8');

  // Verify listeners on carousel
  assert.match(js, /carousel\.addEventListener\(\s*['"]touchstart['"]/);
  assert.match(js, /carousel\.addEventListener\(\s*['"]touchmove['"]/);
  assert.match(js, /carousel\.addEventListener\(\s*['"]touchend['"]/);
  assert.match(js, /carousel\.addEventListener\(\s*['"]touchcancel['"]/);

  // Verify passive option used
  assert.match(js, /carousel\.addEventListener\([^,]+,\s*[^,]+,\s*\{\s*passive:\s*true\s*\}\)/);
});
