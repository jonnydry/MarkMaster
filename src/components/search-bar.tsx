"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  type KeyboardEventHandler,
} from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
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
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
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
      disabled,
      onKeyDown,
    },
    forwardedRef
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(forwardedRef, () => inputRef.current!);

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
          const target = e.target as HTMLElement;
          const tag = target.tagName;
          if (
            tag !== "INPUT" &&
            tag !== "TEXTAREA" &&
            tag !== "SELECT" &&
            !target.isContentEditable
          ) {
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
      <Kbd
        aria-hidden="true"
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
      >
        /
      </Kbd>
    );

    return (
      <div className={cn("relative w-full", className)}>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          onKeyDown={onKeyDown}
          className={cn(
            "h-10 w-full pl-10 pr-10 text-sm transition-all",
            glass
              ? "rounded-sm border-0 bg-transparent shadow-none focus:border-transparent focus:shadow-none focus:ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              : "rounded-sm border-hairline-strong bg-surface-1 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
            inputClassName
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-sm border border-transparent text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
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
