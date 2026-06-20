"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { buttonVariants } from "@/components/ui/button";
import { PageHeaderCompactToggle } from "@/components/page-header-compact-toggle";
import {
  CompactFloatingSearchStrip,
  CompactSearchTrigger,
} from "@/components/compact-floating-search";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitMapGraphSearch } from "@/components/orbit/orbit-map-graph-search";
import { OrbitMapLegendButton } from "@/components/orbit/orbit-map-legend-button";
import { OrbitMapPageIdentity } from "@/components/orbit/orbit-map-page-identity";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import {
  appContentGutterClassName,
  appToolbarSurfaceClassName,
} from "@/lib/app-chrome";
import { orbitDataClass } from "@/lib/orbit-route-chrome";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import { useCompactFloatingSearch } from "@/hooks/use-compact-floating-search";
import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import type { DbUser } from "@/lib/auth";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode, OrbitGraphScope } from "@/types";
import { cn } from "@/lib/utils";

export interface OrbitMapCommandBarProps {
  mobileSidebar?: ReactNode;
  user?: DbUser;
  description: string;
  graphScope: OrbitGraphScope;
  isLoading?: boolean;
  onScopeChange: (scope: OrbitGraphScope) => void;
  isFetching: boolean;
  hasGraph: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  searchResults: OrbitGraphNode[];
  onResultSelect: (selection: OrbitMapSelection) => void;
  keyboardShortcutsOpen: boolean;
  onKeyboardShortcutsOpenChange: (open: boolean) => void;
  shortcutGroups: KeyboardShortcutGroup[];
}

export const OrbitMapCommandBar = forwardRef<
  HTMLInputElement,
  OrbitMapCommandBarProps
>(function OrbitMapCommandBar(
  {
    mobileSidebar,
    user,
    description,
    graphScope,
    isLoading = false,
    onScopeChange,
    isFetching,
    hasGraph,
    search,
    onSearchChange,
    searchQuery,
    searchResults,
    onResultSelect,
    keyboardShortcutsOpen,
    onKeyboardShortcutsOpenChange,
    shortcutGroups,
  },
  searchRef
) {
  const { compact } = usePageHeaderCompact();
  const { expanded: searchExpanded, toggle: toggleSearch, closeIfEmpty } =
    useCompactFloatingSearch(compact, search, searchRef);
  const hasSearchQuery = search.trim().length > 0;

  return (
    <div
      className={cn(
        "orbit-toolbar relative min-w-0",
        compact ? "space-y-1 py-1" : "space-y-1.5 py-1.5",
        appContentGutterClassName
      )}
      data-compact-search-expanded={compact && searchExpanded ? "" : undefined}
    >
      <div
        className={
          compact
            ? "flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2"
            : "contents"
        }
      >
        <div
          className={cn(
            "flex items-center gap-1.5",
            compact && "md:max-w-xs lg:max-w-sm"
          )}
        >
          {mobileSidebar ? (
            <div className="shrink-0 md:hidden">{mobileSidebar}</div>
          ) : null}

          {!compact ? <OrbitMapPageIdentity /> : null}

          {compact ? (
            <CompactSearchTrigger
              onToggle={toggleSearch}
              expanded={searchExpanded}
              hasQuery={hasSearchQuery}
            />
          ) : (
            <OrbitMapGraphSearch
              isFetching={isFetching}
              hasGraph={hasGraph}
              search={search}
              searchQuery={searchQuery}
              searchResults={searchResults}
              searchInputRef={searchRef}
              onSearchChange={onSearchChange}
              onResultSelect={onResultSelect}
            />
          )}

          {user ? (
            <div
              className={cn(
                "hidden shrink-0 sm:block",
                compact && "md:hidden"
              )}
            >
              <UserNavDynamic user={user} />
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            !compact && "mt-0"
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <OrbitMapScopeMenu
              graphScope={graphScope}
              isLoading={isLoading}
              onScopeChange={onScopeChange}
              className={cn(appToolbarSurfaceClassName, compact ? "h-8" : "h-9")}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <OrbitMapLegendButton
              className={cn(appToolbarSurfaceClassName, compact ? "h-8" : "h-9")}
            />

            <KeyboardShortcutsHelpButton
              open={keyboardShortcutsOpen}
              onOpenChange={onKeyboardShortcutsOpenChange}
              groups={shortcutGroups}
              description="Orbit graph search, view, and assignment shortcuts."
              className={cn(
                "shrink-0 border-hairline-strong text-muted-foreground hover:border-primary/30 hover:bg-accent-soft hover:text-foreground",
                compact ? "size-8" : "size-9",
                appToolbarSurfaceClassName
              )}
            />

            <Link
              href="/orbit"
              aria-label="Back to Orbit queue"
              className={cn(
                buttonVariants({ variant: "outline", size: compact ? "sm" : "default" }),
                appToolbarSurfaceClassName,
                compact && "h-8"
              )}
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Orbit queue</span>
            </Link>

            <PageHeaderCompactToggle
              className={cn(appToolbarSurfaceClassName, compact ? "size-8" : "size-9")}
            />

            {user ? (
              <div className={cn("shrink-0", compact ? "hidden md:block" : "sm:hidden")}>
                <UserNavDynamic user={user} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {compact ? (
        <CompactFloatingSearchStrip
          expanded={searchExpanded}
          search={search}
          onSearchChange={onSearchChange}
          searchInputRef={searchRef}
          placeholder="Search graph by tag, collection, or author…"
          onCloseIfEmpty={closeIfEmpty}
        />
      ) : null}

      {!compact ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-0.5 text-xs text-muted-foreground">
          <span className={cn(orbitDataClass(), "normal-case")}>{description}</span>
          {isFetching ? (
            <span className="flex shrink-0 items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Updating graph
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
