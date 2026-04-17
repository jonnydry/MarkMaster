"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
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
      <div className={`relative w-full ${className}`}>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`h-10 w-full rounded-xl border-hairline-strong bg-surface-1 pl-10 pr-10 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/25 focus:shadow-md ${inputClassName}`}
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
