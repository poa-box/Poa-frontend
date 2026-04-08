import { useEffect } from 'react';

/**
 * Temporarily elevates a DOM element above the spotlight overlay so it can be
 * clicked during action steps. Saves and restores original inline styles on cleanup.
 *
 * @param {HTMLElement|null} targetElement  The element to elevate
 * @param {boolean}          shouldElevate  Only elevate when true (action steps)
 */
export default function useTargetElevation(targetElement, shouldElevate) {
  useEffect(() => {
    if (!targetElement || !shouldElevate) return;

    const el = targetElement;
    const saved = {
      position: el.style.position,
      zIndex: el.style.zIndex,
      boxShadow: el.style.boxShadow,
      pointerEvents: el.style.pointerEvents,
    };

    // Only set position if element is statically positioned
    const computed = window.getComputedStyle(el);
    if (computed.position === 'static') {
      el.style.position = 'relative';
    }
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'auto';
    el.style.boxShadow =
      '0 0 0 4px rgba(144, 85, 232, 0.5), 0 0 20px rgba(144, 85, 232, 0.3)';

    return () => {
      el.style.position = saved.position;
      el.style.zIndex = saved.zIndex;
      el.style.boxShadow = saved.boxShadow;
      el.style.pointerEvents = saved.pointerEvents;
    };
  }, [targetElement, shouldElevate]);
}
