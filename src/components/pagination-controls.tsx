"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationVariant = "library" | "orbit";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  variant?: PaginationVariant;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  variant = "library",
  className,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const isLibrary = variant === "library";

  return (
    <div
      className={cn(
        isLibrary
          ? "flex flex-col items-center gap-3 border-t border-border py-4"
          : "flex items-center justify-center gap-2 pt-2",
        className
      )}
      role="navigation"
      aria-label="Pagination"
    >
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center border border-hairline-soft text-foreground transition-colors disabled:pointer-events-none disabled:opacity-30",
            isLibrary
              ? "rounded-sm bg-transparent hover:border-primary/30 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              : "rounded-sm bg-surface-1 shadow-sm hover:bg-surface-2"
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span
          className={cn(
            "tabular-nums text-muted-foreground",
            isLibrary ? "text-sm" : "text-xs"
          )}
          aria-live="polite"
        >
          {isLibrary ? (
            <>
              <span className="sr-only">Page </span>
              {page}{" "}
              <span className="text-muted-foreground/50" aria-hidden>
                of
              </span>{" "}
              <span className="sr-only">of</span> {totalPages}
            </>
          ) : (
            <>
              <span className="sm:hidden">Page </span>
              {page} of {totalPages}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center border border-hairline-soft text-foreground transition-colors disabled:pointer-events-none disabled:opacity-30",
            isLibrary
              ? "rounded-sm bg-transparent hover:border-primary/30 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
              : "rounded-sm bg-surface-1 shadow-sm hover:bg-surface-2"
          )}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      {isLibrary ? (
        <div className="h-1 w-24 overflow-hidden rounded-[2px] bg-muted">
          <div
            className="h-full rounded-[2px] bg-primary/40 transition-all duration-300"
            style={{
              width: `${((page - 1) / Math.max(totalPages - 1, 1)) * 100}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
