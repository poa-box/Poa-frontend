import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

/**
 * Cache for prepared text to avoid redundant canvas measurements.
 * Keyed by `${text}||${font}||${whiteSpace}`.
 */
const preparedCache = new Map();

function getCachedPrepare(text, font, options) {
  const key = `${text}||${font}||${options?.whiteSpace || 'normal'}`;
  if (preparedCache.has(key)) return preparedCache.get(key);
  const prepared = prepare(text, font, options);
  preparedCache.set(key, prepared);
  // Evict oldest entries if cache grows too large
  if (preparedCache.size > 500) {
    const firstKey = preparedCache.keys().next().value;
    preparedCache.delete(firstKey);
  }
  return prepared;
}

function getCachedPrepareWithSegments(text, font, options) {
  const key = `segments||${text}||${font}||${options?.whiteSpace || 'normal'}`;
  if (preparedCache.has(key)) return preparedCache.get(key);
  const prepared = prepareWithSegments(text, font, options);
  preparedCache.set(key, prepared);
  if (preparedCache.size > 500) {
    const firstKey = preparedCache.keys().next().value;
    preparedCache.delete(firstKey);
  }
  return prepared;
}

/**
 * Hook to calculate text height without DOM reflow.
 *
 * @param {string} text - The text content
 * @param {object} options
 * @param {string} options.font - CSS font shorthand, e.g. "16px Inter"
 * @param {number} options.maxWidth - Container width in px
 * @param {number} options.lineHeight - Line height in px
 * @param {string} [options.whiteSpace] - 'normal' or 'pre-wrap'
 * @returns {{ height: number, lineCount: number }}
 */
export function useTextHeight(text, { font, maxWidth, lineHeight, whiteSpace } = {}) {
  return useMemo(() => {
    if (!text || !font || !maxWidth || !lineHeight) {
      return { height: 0, lineCount: 0 };
    }
    try {
      const prepared = getCachedPrepare(text, font, whiteSpace ? { whiteSpace } : undefined);
      return layout(prepared, maxWidth, lineHeight);
    } catch {
      return { height: 0, lineCount: 0 };
    }
  }, [text, font, maxWidth, lineHeight, whiteSpace]);
}

/**
 * Hook to truncate text to fit within a given width on a single line.
 * Returns the truncated string with ellipsis if it overflows.
 *
 * @param {string} text - The text to truncate
 * @param {object} options
 * @param {string} options.font - CSS font shorthand
 * @param {number} options.maxWidth - Max width in px
 * @param {number} options.maxLines - Max lines before truncating (default 1)
 * @param {number} options.lineHeight - Line height in px
 * @returns {string} Truncated text
 */
export function useTextTruncation(text, { font, maxWidth, maxLines = 1, lineHeight } = {}) {
  return useMemo(() => {
    if (!text || !font || !maxWidth || !lineHeight) return text || '';

    try {
      const prepared = getCachedPrepareWithSegments(text, font);
      const result = layoutWithLines(prepared, maxWidth, lineHeight);

      if (result.lines.length <= maxLines) return text;

      // Get text up to the end of the last allowed line, add ellipsis
      const lastLine = result.lines[maxLines - 1];
      const truncated = lastLine.text ? text.substring(0, text.indexOf(lastLine.text) + lastLine.text.length) : text;
      return truncated.trimEnd() + '…';
    } catch {
      // Fallback to character-based truncation
      return text;
    }
  }, [text, font, maxWidth, maxLines, lineHeight]);
}

/**
 * Hook that measures text height with automatic container width detection.
 * Observes container resize and recalculates.
 *
 * @param {string} text - The text content
 * @param {object} options
 * @param {string} options.font - CSS font shorthand
 * @param {number} options.lineHeight - Line height in px
 * @param {string} [options.whiteSpace] - 'normal' or 'pre-wrap'
 * @param {number} [options.padding] - Horizontal padding to subtract from width
 * @returns {{ ref: React.RefObject, height: number, lineCount: number }}
 */
export function useAutoTextHeight(text, { font, lineHeight, whiteSpace, padding = 0 } = {}) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;

    const updateWidth = () => {
      if (ref.current) {
        setWidth(ref.current.clientWidth - padding);
      }
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [padding]);

  const result = useTextHeight(text, {
    font,
    maxWidth: width > 0 ? width : undefined,
    lineHeight,
    whiteSpace,
  });

  return { ref, ...result };
}

/**
 * Batch-calculate heights for an array of text items.
 * Useful for lists like ConversationLog.
 *
 * @param {Array<{ text: string, font: string }>} items
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @returns {Array<{ height: number, lineCount: number }>}
 */
export function useBatchTextHeights(items, maxWidth, lineHeight) {
  return useMemo(() => {
    if (!items?.length || !maxWidth || !lineHeight) return [];
    return items.map(({ text, font }) => {
      if (!text || !font) return { height: 0, lineCount: 0 };
      try {
        const prepared = getCachedPrepare(text, font);
        return layout(prepared, maxWidth, lineHeight);
      } catch {
        return { height: 0, lineCount: 0 };
      }
    });
  }, [items, maxWidth, lineHeight]);
}

/**
 * Imperative helper: measure text height directly (not a hook).
 * Useful inside event handlers or animation loops.
 */
export function measureTextHeight(text, font, maxWidth, lineHeight, whiteSpace) {
  if (!text || !font || !maxWidth || !lineHeight) return { height: 0, lineCount: 0 };
  try {
    const prepared = getCachedPrepare(text, font, whiteSpace ? { whiteSpace } : undefined);
    return layout(prepared, maxWidth, lineHeight);
  } catch {
    return { height: 0, lineCount: 0 };
  }
}
