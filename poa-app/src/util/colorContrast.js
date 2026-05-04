/**
 * Color contrast utilities for org-customizable backgrounds.
 *
 * Orgs can set `backgroundColor` to any CSS value (hex, rgb/rgba, named color,
 * linear/radial gradient). Text that sits directly on that background needs a
 * foreground color that stays readable regardless of what the org picked.
 *
 * Flow:
 *   raw CSS string → parseBackgroundColor() → { r, g, b } (premultiplied over white)
 *                  → relativeLuminance() → 0..1
 *                  → getBackgroundMode() → "light" | "dark" | "unknown"
 *                  → resolveOnBackground() → Chakra color token (e.g. "warmGray.50")
 *
 * Gradients are handled by extracting stops and averaging their luminance
 * (good enough for mode detection; exact WCAG contrast on a gradient is not
 * well-defined anyway).
 */

const HEX_SHORT_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX_LONG_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_RE = /^rgba?\(\s*([^)]+)\)$/i;

// Small set of named colors commonly typed by users. The DOM fallback in
// `parseNamedColor` handles the rest when running in the browser.
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
};

function clamp255(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(value) {
  const short = value.match(HEX_SHORT_RE);
  if (short) {
    const [, r, g, b, a] = short;
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
      a: a === undefined ? 1 : parseInt(a + a, 16) / 255,
    };
  }
  const long = value.match(HEX_LONG_RE);
  if (long) {
    const [, r, g, b, a] = long;
    return {
      r: parseInt(r, 16),
      g: parseInt(g, 16),
      b: parseInt(b, 16),
      a: a === undefined ? 1 : parseInt(a, 16) / 255,
    };
  }
  return null;
}

function parseRgb(value) {
  const m = value.match(RGB_RE);
  if (!m) return null;
  // Supports comma or whitespace separators and percentages.
  const parts = m[1]
    .split(/[\s,/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const toByte = (p) => {
    if (p.endsWith('%')) return clamp255((parseFloat(p) / 100) * 255);
    return clamp255(parseFloat(p));
  };
  const toAlpha = (p) => {
    if (p === undefined) return 1;
    if (p.endsWith('%')) return Math.max(0, Math.min(1, parseFloat(p) / 100));
    const n = parseFloat(p);
    return Number.isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
  };

  return {
    r: toByte(parts[0]),
    g: toByte(parts[1]),
    b: toByte(parts[2]),
    a: toAlpha(parts[3]),
  };
}

// Browser-only fallback for named colors and any other CSS syntax the
// hex/rgb parsers don't recognize. Returns null during SSR.
function parseViaDom(value) {
  if (typeof document === 'undefined') return null;
  try {
    const el = document.createElement('div');
    el.style.color = 'rgb(0, 0, 0)';
    el.style.color = value;
    if (!el.style.color || el.style.color === 'rgb(0, 0, 0)') {
      // Value may still be legitimately black — disambiguate by checking
      // if the lowercased input is a known "maps-to-black" CSS color.
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'black' || normalized === '#000' || normalized === '#000000') {
        return { r: 0, g: 0, b: 0, a: 1 };
      }
      return null;
    }
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);
    return parseRgb(computed);
  } catch {
    return null;
  }
}

function parseNamedColor(value) {
  const normalized = String(value).trim().toLowerCase();
  if (NAMED_COLORS[normalized]) return { ...NAMED_COLORS[normalized] };
  return parseViaDom(value);
}

/**
 * Extract color stops from a CSS gradient function and return their average
 * (alpha-weighted). Handles nested rgb()/rgba() commas correctly.
 */
function parseGradient(value) {
  const trimmed = String(value).trim();
  if (!/gradient\s*\(/i.test(trimmed)) return null;

  // Strip the gradient function wrapper, keeping only the argument list.
  const openIdx = trimmed.indexOf('(');
  const closeIdx = trimmed.lastIndexOf(')');
  if (openIdx < 0 || closeIdx < 0) return null;
  const inner = trimmed.slice(openIdx + 1, closeIdx);

  // Split top-level commas (not inside nested parens like rgb(...)).
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());

  // Each part is "color [stop]" or a direction ("135deg", "to right", etc.).
  // Pull the leading color token off each part and try to parse it.
  const colors = [];
  for (const part of parts) {
    const colorMatch =
      part.match(/^#[0-9a-f]+/i)?.[0] ||
      part.match(/^rgba?\([^)]+\)/i)?.[0] ||
      part.match(/^hsla?\([^)]+\)/i)?.[0] ||
      part.match(/^[a-z]+/i)?.[0];
    if (!colorMatch) continue;
    // Skip direction keywords — they don't parse as colors and must not
    // contaminate the average (e.g. "to" in "to right").
    if (/^(to|deg|rad|turn|at|in|circle|ellipse|closest|farthest|from)$/i.test(colorMatch)) continue;
    const parsed = parseSolid(colorMatch);
    if (parsed && parsed.a > 0) colors.push(parsed);
  }

  if (colors.length === 0) return null;

  // Alpha-weighted average. A fully opaque stop contributes fully; a
  // translucent stop contributes proportionally.
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  for (const c of colors) {
    sr += c.r * c.a;
    sg += c.g * c.a;
    sb += c.b * c.a;
    sa += c.a;
  }
  if (sa === 0) return null;
  return {
    r: sr / sa,
    g: sg / sa,
    b: sb / sa,
    a: Math.min(1, sa / colors.length),
  };
}

/**
 * Parse a single solid color (not a gradient).
 */
function parseSolid(value) {
  if (!value) return null;
  const v = String(value).trim();
  return parseHex(v) || parseRgb(v) || parseNamedColor(v);
}

/**
 * Composite a color with alpha over an opaque white backdrop. The app's
 * default body background is white-ish, so this is the right baseline for
 * translucent org colors like `rgba(45, 134, 255, 0.97)`.
 */
function compositeOverWhite(rgba) {
  const a = rgba.a ?? 1;
  if (a >= 1) return { r: rgba.r, g: rgba.g, b: rgba.b };
  return {
    r: rgba.r * a + 255 * (1 - a),
    g: rgba.g * a + 255 * (1 - a),
    b: rgba.b * a + 255 * (1 - a),
  };
}

/**
 * Parse any CSS background value (solid or gradient) into an opaque RGB
 * suitable for luminance computation. Returns null if unparseable.
 */
export function parseBackgroundColor(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const gradient = /gradient\s*\(/i.test(trimmed) ? parseGradient(trimmed) : null;
  const rgba = gradient || parseSolid(trimmed);
  if (!rgba) return null;
  return compositeOverWhite(rgba);
}

/**
 * WCAG relative luminance. Input is {r, g, b} with 0..255 channels.
 * Output is 0..1.
 */
export function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Determine whether the org background is light, dark, or unparseable.
 * Threshold of 0.5 is the standard "is this closer to white or black" cut.
 */
export function getBackgroundMode(value) {
  if (!value) return 'unknown';
  const rgb = parseBackgroundColor(value);
  if (!rgb) return 'unknown';
  return relativeLuminance(rgb) > 0.5 ? 'light' : 'dark';
}

/**
 * Resolve Chakra color tokens for text that sits directly on the org
 * background. We use three levels of emphasis:
 *   - primary: page titles, important headings
 *   - muted:   subtitles, helper text, secondary labels
 *   - subtle:  deemphasized text (footers, captions)
 *
 * "Unknown" resolves to the light-mode palette because the app's default
 * body background (`_app.js` global styles) is a light pastel gradient. A
 * null/unparseable org value means "no override" → light default applies.
 */
export function resolveOnBackground(mode) {
  if (mode === 'dark') {
    return {
      onBackground: 'warmGray.50',
      onBackgroundMuted: 'whiteAlpha.800',
      onBackgroundSubtle: 'whiteAlpha.600',
    };
  }
  // light or unknown (the default body gradient is light). Values chosen to
  // match the palette used across the app pre-theming (Heading at .900,
  // description text at .600, form helpers at .400).
  return {
    onBackground: 'warmGray.900',
    onBackgroundMuted: 'warmGray.600',
    onBackgroundSubtle: 'warmGray.400',
  };
}
