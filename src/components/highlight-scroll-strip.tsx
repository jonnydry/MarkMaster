"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface HighlightScrollStripProps {
  children: React.ReactNode;
  /** Accessible name for the scroll region */
  ariaLabel: string;
  itemCount: number;
  className?: string;
}

export function HighlightScrollStrip({
  children,
  ariaLabel,
  itemCount,
  className,
}: HighlightScrollStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = useCallback(() => {
    const el = scrollRef.current;
    if (!el || itemCount === 0) return;

    const slides = el.querySelectorAll<HTMLElement>("[data-strip-slide]");
    if (slides.length === 0) return;

    const scrollLeft = el.scrollLeft;
    let closest = 0;
    let closestDist = Infinity;

    slides.forEach((slide, i) => {
      const dist = Math.abs(slide.offsetLeft - scrollLeft);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });

    setActiveIndex(closest);
  }, [itemCount]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateActiveIndex();
    el.addEventListener("scroll", updateActiveIndex, { passive: true });
    return () => el.removeEventListener("scroll", updateActiveIndex);
  }, [updateActiveIndex, itemCount]);

  const scrollToIndex = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>(`[data-strip-slide="${index}"]`);
    if (!slide) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    slide.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "start",
    });
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        className={cn(
          "flex items-stretch gap-2 overflow-x-auto pb-1",
          "snap-x snap-mandatory",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {children}
      </div>

      {itemCount > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="sr-only" aria-live="polite">
            {activeIndex + 1} of {itemCount}
          </p>
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: itemCount }, (_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => scrollToIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex
                    ? "w-4 bg-primary/80"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <span className="text-2xs tabular-nums text-muted-foreground/70">
            {activeIndex + 1} / {itemCount}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function HighlightScrollSlide({
  children,
  index,
  desktopTwoUp = false,
  className,
}: {
  children: React.ReactNode;
  index: number;
  desktopTwoUp?: boolean;
  className?: string;
}) {
  return (
    <div
      data-strip-slide={index}
      className={cn(
        "flex min-w-0 w-[min(280px,85vw)] shrink-0 snap-start snap-always [&>*]:min-w-0 [&>*]:w-full",
        desktopTwoUp && "lg:w-[calc(50%-0.25rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}
