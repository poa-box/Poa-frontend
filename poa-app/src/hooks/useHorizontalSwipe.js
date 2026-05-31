// Direction-reporting horizontal-swipe handler.
//
// Unlike useSwipeNavigation (which owns an activeIndex for an in-place
// carousel), this hook just detects a committed left/right swipe and fires a
// callback — meant for route-driven navigation where the URL, not local state,
// is the source of truth. Thresholds mirror useSwipeNavigation so the gesture
// feel matches the task-board column swipe.
//
// Gesture intent is handled by `touch-action: pan-y` on the consuming element
// (the browser keeps vertical scrolling and surrenders horizontal to us), so
// there's no need to preventDefault() — which React's passive touch listeners
// can't honour anyway. We compare the start and end points in onTouchEnd and
// ignore anything with too much vertical drift.

import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 50;
const SCROLL_TOLERANCE = 45;

export function useHorizontalSwipe({ onSwipeLeft, onSwipeRight } = {}) {
  const startX = useRef(null);
  const startY = useRef(null);

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (startX.current == null || startY.current == null) return;

    const diffX = startX.current - e.changedTouches[0].clientX;
    const diffY = Math.abs(startY.current - e.changedTouches[0].clientY);

    if (diffY <= SCROLL_TOLERANCE && Math.abs(diffX) > SWIPE_THRESHOLD) {
      if (diffX > 0) {
        onSwipeLeft?.(); // finger moved left → reveal the next (right-hand) item
      } else {
        onSwipeRight?.(); // finger moved right → reveal the previous item
      }
    }

    startX.current = null;
    startY.current = null;
  }, [onSwipeLeft, onSwipeRight]);

  return {
    touchHandlers: { onTouchStart, onTouchEnd },
  };
}

export default useHorizontalSwipe;
