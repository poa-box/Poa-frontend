/**
 * useSwipeNavigation
 * Horizontal-swipe navigation for mobile carousels.
 *
 * Phase 2 of the mobile Task Manager redesign: tap on the
 * ColumnTabBar is the primary nav, and swipe is now an
 * additive shortcut. `SCROLL_TOLERANCE` was bumped from 30 → 45
 * so that vertical card drags inside a column don't accidentally
 * register as horizontal column swaps. The first-visit
 * "swipe to navigate" guide overlay was removed alongside the
 * top column header; the visible tabs teach the gesture
 * naturally.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const SWIPE_THRESHOLD = 50;
const SCROLL_TOLERANCE = 45;

/**
 * Hook for swipe navigation with improved touch detection
 * @param {Object} options - Configuration options
 * @param {number} options.itemCount - Total number of items to navigate
 * @param {number} options.initialIndex - Initial active index
 * @param {Function} options.onNavigate - Callback when navigation occurs
 * @returns {Object} Swipe navigation handlers and state
 */
export function useSwipeNavigation({
  itemCount,
  initialIndex = 0,
  onNavigate,
} = {}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const containerRef = useRef(null);

  const navigateTo = useCallback((index) => {
    if (index >= 0 && index < itemCount) {
      setActiveIndex(index);
      onNavigate?.(index);
    }
  }, [itemCount, onNavigate]);

  const navigateNext = useCallback(() => {
    if (activeIndex < itemCount - 1) {
      navigateTo(activeIndex + 1);
    }
  }, [activeIndex, itemCount, navigateTo]);

  const navigatePrev = useCallback(() => {
    if (activeIndex > 0) {
      navigateTo(activeIndex - 1);
    }
  }, [activeIndex, navigateTo]);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchStartX.current || !touchStartY.current) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX.current - touchX;
    const diffY = Math.abs(touchStartY.current - touchY);

    // Only horizontal swipes with minimal vertical movement
    if (Math.abs(diffX) > 15 && diffY < SCROLL_TOLERANCE) {
      setIsSwiping(true);
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartX.current || !touchStartY.current || !isSwiping) {
      touchStartX.current = null;
      touchStartY.current = null;
      setIsSwiping(false);
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX.current - touchEndX;
    const diffY = Math.abs(touchStartY.current - touchEndY);

    // Skip if too much vertical movement
    if (diffY > SCROLL_TOLERANCE) {
      touchStartX.current = null;
      touchStartY.current = null;
      setIsSwiping(false);
      return;
    }

    // Process swipe
    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      if (diffX > 0) {
        navigateNext();
      } else {
        navigatePrev();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    setIsSwiping(false);
  }, [isSwiping, navigateNext, navigatePrev]);

  // Keep activeIndex in bounds when itemCount changes
  useEffect(() => {
    if (itemCount > 0 && activeIndex >= itemCount) {
      setActiveIndex(itemCount - 1);
    }
  }, [itemCount, activeIndex]);

  return {
    activeIndex,
    setActiveIndex: navigateTo,
    containerRef,
    isSwiping,
    navigateNext,
    navigatePrev,
    canNavigateNext: activeIndex < itemCount - 1,
    canNavigatePrev: activeIndex > 0,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

export default useSwipeNavigation;
