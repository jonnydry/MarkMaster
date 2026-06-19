"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";

export type LibrarySearchPickerItem = {
  id: string;
  searchText: string;
  disabled?: boolean;
  label: ReactNode;
  onSelect: () => void;
  className?: string;
};

type LibrarySearchPickerProps = {
  placeholder: string;
  emptyLabel?: string;
  groupHeading?: string;
  items: LibrarySearchPickerItem[];
  footerItems?: LibrarySearchPickerItem[];
  className?: string;
};

export function LibrarySearchPicker({
  placeholder,
  emptyLabel = "No matches.",
  groupHeading,
  items,
  footerItems = [],
  className,
}: LibrarySearchPickerProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const normalizedQuery = query.trim().toLowerCase();
  const t = useTypography();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      item.searchText.toLowerCase().includes(normalizedQuery)
    );
  }, [items, normalizedQuery]);

  const filteredFooterItems = useMemo(() => {
    if (!normalizedQuery) return footerItems;
    return footerItems.filter((item) =>
      item.searchText.toLowerCase().includes(normalizedQuery)
    );
  }, [footerItems, normalizedQuery]);

  const selectableItems = useMemo(
    () =>
      [...filteredItems, ...filteredFooterItems].filter((item) => !item.disabled),
    [filteredFooterItems, filteredItems]
  );

  const resolvedFocusedIndex =
    selectableItems.length === 0
      ? -1
      : focusedIndex < 0 || focusedIndex >= selectableItems.length
        ? 0
        : focusedIndex;

  useEffect(() => {
    if (resolvedFocusedIndex < 0) return;
    const item = selectableItems[resolvedFocusedIndex];
    if (!item) return;
    document
      .getElementById(`library-picker-item-${item.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [resolvedFocusedIndex, selectableItems]);

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setFocusedIndex(-1);
    },
    []
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (selectableItems.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev < 0 ? 0 : (prev + 1) % selectableItems.length
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev < 0
            ? selectableItems.length - 1
            : (prev - 1 + selectableItems.length) % selectableItems.length
        );
        break;
      case "Enter": {
        event.preventDefault();
        const item = selectableItems[resolvedFocusedIndex];
        item?.onSelect();
        break;
      }
      default:
        break;
    }
  };

  const renderRow = (item: LibrarySearchPickerItem) => {
    const selectableIndex = selectableItems.findIndex(
      (candidate) => candidate.id === item.id
    );
    const selected =
      selectableIndex >= 0 && selectableIndex === resolvedFocusedIndex;

    return (
      <button
        key={item.id}
        id={`library-picker-item-${item.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        disabled={item.disabled}
        className={cn(
          "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none",
          "text-popover-foreground disabled:pointer-events-none disabled:opacity-50",
          selected ? "bg-accent-soft" : "hover:bg-accent-soft",
          item.className
        )}
        onMouseEnter={() => {
          if (!item.disabled && selectableIndex >= 0) {
            setFocusedIndex(selectableIndex);
          }
        }}
        onClick={() => {
          if (!item.disabled) item.onSelect();
        }}
      >
        {item.label}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "flex max-h-80 flex-col overflow-hidden rounded-sm bg-popover text-popover-foreground",
        className
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-hairline-soft p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden
          />
          <Input
            value={query}
            onChange={handleQueryChange}
            placeholder={placeholder}
            className="h-8 border-hairline-soft bg-surface-1 pl-8 text-popover-foreground placeholder:text-muted-foreground/70"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="library-picker-list"
            aria-activedescendant={
              resolvedFocusedIndex >= 0
                ? `library-picker-item-${selectableItems[resolvedFocusedIndex]?.id}`
                : undefined
            }
          />
        </div>
      </div>
      <div
        id="library-picker-list"
        role="listbox"
        className="max-h-64 overflow-y-auto p-1 scrollbar-thin"
      >
        {groupHeading ? (
          <p className={cn(t.sectionLabel, "px-2 py-1.5 mb-0")}>
            {groupHeading}
          </p>
        ) : null}
        {filteredItems.length === 0 && filteredFooterItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <>
            {filteredItems.map(renderRow)}
            {filteredFooterItems.length > 0 ? (
              <div className="mt-1 border-t border-hairline-soft pt-1">
                {filteredFooterItems.map(renderRow)}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
