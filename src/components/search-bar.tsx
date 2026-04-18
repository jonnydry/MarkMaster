"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Transparent field: use inside a frosted wrapper so there is only one visual surface. */
  glass?: boolean;
  hint?: React.ReactNode;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    {
      value,
      onChange,
      placeholder = "Search...",
      className = "",
      inputClassName = "",
      glass = false,
      hint,
    },
    forwardedRef
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(forwardedRef, () => inputRef.current!);

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }
        if (e.key === "Escape") {
          inputRef.current?.blur();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);

    const defaultHint = !value && (
      <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-hairline-soft bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground/60 shadow-sm">
        /
      </kbd>
    );

    return (
      <div className={cn("relative w-full", className)}>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full pl-10 pr-10 text-sm transition-all",
            glass
              ? "rounded-2xl border-0 bg-transparent shadow-none focus:border-transparent focus:shadow-none focus:ring-2 focus:ring-primary/25 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-primary/25 dark:bg-transparent"
              : "rounded-xl border-hairline-strong bg-surface-1 shadow-sm focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/25",
            inputClassName
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : hint !== undefined ? (
          hint
        ) : (
          defaultHint
        )}
      </div>
    );
  }
);
