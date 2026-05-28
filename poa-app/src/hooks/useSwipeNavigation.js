// Horizontal-swipe navigation for the mobile column carousel.
// Tap on ColumnTabBar is the primary nav; swipe is the shortcut.
// SCROLL_TOLERANCE is 45 (not 30) so vertical card drags don't
// accidentally register as horizontal column swaps.

import { useState, useRef, useCallback, useEffect } from 'react';

const SWIPE_THRESHOLD = 50;
const SCROLL_TOLERANCE = 45;

export function useSwipeNavigation({ itemCount, initialIndex = 0, onNavigate } = {}) {
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
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

export default useSwipeNavigation;
