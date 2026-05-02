import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number | ((prev: number) => number)) => void;
}

export function PaginationBar({ page, totalPages, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-center gap-3 py-4 border-t border-border">
      <div className="flex items-center gap-2 text-sm" role="navigation" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange((p) => p - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          <span className="sr-only">Page </span>
          {page}{" "}
          <span className="text-muted-foreground/50" aria-hidden>
            of
          </span>{" "}
          <span className="sr-only">of</span> {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange((p) => p + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline-soft bg-surface-1 text-foreground shadow-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary/40 rounded-full transition-all duration-300"
          style={{ width: `${((page - 1) / Math.max(totalPages - 1, 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
