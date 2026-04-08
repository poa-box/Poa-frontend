import { useState, useEffect, useRef } from 'react';

/**
 * Finds a DOM element by selector, sets the rect immediately,
 * then scrolls to center and re-measures after settling.
 */
export default function useSpotlightTarget(selector, isActive) {
  const [rect, setRect] = useState(null);
  const [element, setElement] = useState(null);
  const rafRef = useRef(null);

  // Clear state between steps immediately
  useEffect(() => {
    if (!isActive || !selector) {
      setRect(null);
      setElement(null);
      return;
    }

    // Clear previous step's target immediately so spotlight doesn't linger
    setRect(null);
    setElement(null);

    let cancelled = false;
    let attempts = 0;

    function found(el) {
      if (cancelled) return;

      // Set rect IMMEDIATELY so spotlight appears at the right place
      const r = el.getBoundingClientRect();
      setRect(r);
      setElement(el);

      // Then scroll to center the element
      const targetCenter = r.top + r.height / 2 + window.scrollY;
      const scrollTarget = targetCenter - window.innerHeight / 2;
      const needsScroll = Math.abs(scrollTarget - window.scrollY) > 30;

      if (needsScroll) {
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        // Re-measure after scroll settles
        setTimeout(() => {
          if (!cancelled) setRect(el.getBoundingClientRect());
        }, 350);
      }
    }

    function tryFind() {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el) {
        found(el);
      } else if (++attempts < 100) {
        setTimeout(tryFind, 100);
      }
    }

    tryFind();
    return () => { cancelled = true; };
  }, [selector, isActive]);

  // Track position changes (scroll, resize, layout shifts)
  useEffect(() => {
    if (!element) return;

    const update = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const r = element.getBoundingClientRect();
        setRect(prev => {
          if (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1) return prev;
          return r;
        });
      });
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(element);

    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [element]);

  return { targetRect: rect, targetElement: element };
}
