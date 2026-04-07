"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
}: SearchBarProps) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

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

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 300);
  };

  return (
    <div className="relative w-full max-w-[260px]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3f3f46]" />
      <Input
        ref={inputRef}
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8 h-8 text-[13px] bg-card border-border rounded-lg placeholder:text-[#3f3f46] focus:ring-primary"
      />
      {local && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {!local && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#3f3f46] bg-muted px-1.5 py-0.5 rounded border border-border">
          /
        </kbd>
      )}
    </div>
  );
}
