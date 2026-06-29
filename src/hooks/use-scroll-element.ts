"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Subscribe to a scroll container ref so virtualizers re-render once the shell
 * attaches the ref (ref assignment alone does not re-render children).
 */
export function useScrollElement(
  ref: RefObject<HTMLElement | null> | undefined
): HTMLElement | null {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!ref) {
      setElement(null);
      return;
    }

    const sync = () => {
      const next = ref.current;
      setElement((current) => (current === next ? current : next));
    };

    sync();
    const frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [ref]);

  return element;
}
