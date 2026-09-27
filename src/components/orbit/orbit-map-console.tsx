"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitMapIdentity } from "@/components/orbit/orbit-page-identity";
import { OrbitModeSwitch } from "@/components/orbit/orbit-mode-switch";
import { OrbitMapFilterControl } from "@/components/orbit/orbit-map-filter-control";
import { OrbitMapGraphSearch } from "@/components/orbit/orbit-map-graph-search";
import { OrbitMapMotionMenu } from "@/components/orbit/orbit-map-motion-menu";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import type { DbUser } from "@/lib/auth";
import type { GraphFilter } from "@/lib/orbit-worker-protocol";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode, OrbitGraphScope } from "@/types";
import { cn } from "@/lib/utils";

export interface OrbitMapConsoleProps {
  mobileSidebar?: ReactNode;
  user?: DbUser;
  graphScope: OrbitGraphScope;
  isLoading?: boolean;
  onScopeChange: (scope: OrbitGraphScope) => void;
  activeFilter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
  /** Hide the Loose filter when the fetched graph is already the queue. */
  hideLooseFilter?: boolean;
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
  livingEnabled: boolean;
  onLivingEnabledChange: (enabled: boolean) => void;
  /** Months Replay can cover; null disables it. */
  replayMonths: number | null;
  onReplay: () => void;
}

const controlOnGlassClass =
  "h-8 border-transparent bg-transparent hover:bg-hover";

const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45";

/**
 * The Orbit map's chrome: two bars over the canvas.
 *  - left: identity, Queue⇄Map, scope, and the All/Loose/Recent filter
 *  - right: graph search, motion, shortcuts, user
 *
 * Below lg the scope and filter drop to a second row under the left bar, and
 * below sm search collapses to an icon that opens a full-width field, so the
 * bars never run into each other on narrow screens.
 */
export const OrbitMapConsole = forwardRef<HTMLInputElement, OrbitMapConsoleProps>(
  function OrbitMapConsole(
    {
      mobileSidebar,
      user,
      graphScope,
      isLoading = false,
      onScopeChange,
      activeFilter,
      onFilterChange,
      hideLooseFilter = false,
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
      livingEnabled,
      onLivingEnabledChange,
      replayMonths,
      onReplay,
    },
    searchRef
  ) {
    const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
    const phoneSearchRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (phoneSearchOpen) phoneSearchRef.current?.focus();
    }, [phoneSearchOpen]);

    const closePhoneSearch = () => {
      onSearchChange("");
      setPhoneSearchOpen(false);
    };

    const scopeMenu = (
      <OrbitMapScopeMenu
        graphScope={graphScope}
        isLoading={isLoading}
        onScopeChange={onScopeChange}
        className={controlOnGlassClass}
      />
    );
    const filterControl = (
      <OrbitMapFilterControl
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
        hideLooseFilter={hideLooseFilter}
      />
    );

    return (
      <>
        <div className="pointer-events-none absolute inset-x-3 top-3 z-40 flex items-start justify-between gap-2 lg:inset-x-4 lg:top-4">
          {/* Left bar — identity, mode switch, and (lg+) scope + filter. */}
          <div
            className={cn(
              orbitMapFloatingShellClass(),
              "map-glass-accent pointer-events-auto flex min-w-0 items-center gap-2 px-2 py-1.5"
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center text-primary">
              <OrbitLogoMark className="size-4" />
            </span>
            <OrbitMapIdentity className="hidden min-w-0 xl:block" />
            <span className="hidden h-5 w-px shrink-0 bg-hairline-soft xl:block" />
            <OrbitModeSwitch active="map" size="md" />
            <div className="hidden items-center gap-2 lg:flex">
              {scopeMenu}
              <span className="h-5 w-px shrink-0 bg-hairline-soft" />
              {filterControl}
            </div>
          </div>

          {/* Right bar — search + tools. */}
          <div className="pointer-events-auto flex min-w-0 items-center gap-2">
            <div
              className={cn(
                orbitMapFloatingShellClass(),
                "hidden w-[12rem] items-center px-1.5 py-1 sm:flex lg:w-[16rem]"
              )}
            >
              <OrbitMapGraphSearch
                searchInputRef={searchRef}
                embedded
                isFetching={isFetching}
                hasGraph={hasGraph}
                search={search}
                searchQuery={searchQuery}
                searchResults={searchResults}
                onSearchChange={onSearchChange}
                onResultSelect={onResultSelect}
                placeholder="Search tags, collections, posts…"
              />
            </div>
            <div
              className={cn(
                orbitMapFloatingShellClass(),
                "flex items-center gap-1 px-1.5 py-1"
              )}
            >
              <button
                type="button"
                className={cn(iconButtonClass, "sm:hidden")}
                aria-label="Search the map"
                aria-expanded={phoneSearchOpen}
                onClick={() => setPhoneSearchOpen(true)}
                disabled={!hasGraph}
              >
                <Search className="size-4" aria-hidden />
              </button>
              <OrbitMapMotionMenu
                enabled={livingEnabled}
                onEnabledChange={onLivingEnabledChange}
                replayMonths={replayMonths}
                onReplay={onReplay}
              />
              <span className="hidden sm:inline-flex">
                <KeyboardShortcutsHelpButton
                  open={keyboardShortcutsOpen}
                  onOpenChange={onKeyboardShortcutsOpenChange}
                  groups={shortcutGroups}
                  description="Orbit graph search, view, and assignment shortcuts."
                  toolbarSize="compact"
                />
              </span>
              {mobileSidebar ? (
                <div className="shrink-0 md:hidden">{mobileSidebar}</div>
              ) : null}
              {user ? <UserNavDynamic user={user} avatarSize="default" /> : null}
            </div>
          </div>
        </div>

        {/* Below lg: scope + filter on their own row under the left bar. */}
        <div className="pointer-events-none absolute left-3 top-[4.25rem] z-30 flex lg:hidden">
          <div
            className={cn(
              orbitMapFloatingShellClass(),
              "pointer-events-auto flex items-center gap-1.5 px-1.5 py-1"
            )}
          >
            {filterControl}
            {scopeMenu}
          </div>
        </div>

        {/* Phones: search opens as a full-width field over the top bar. */}
        {phoneSearchOpen ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-50 sm:hidden">
            <div
              className={cn(
                orbitMapFloatingShellClass(),
                "pointer-events-auto flex items-center gap-1 px-1.5 py-1"
              )}
            >
              <OrbitMapGraphSearch
                searchInputRef={phoneSearchRef}
                embedded
                isFetching={isFetching}
                hasGraph={hasGraph}
                search={search}
                searchQuery={searchQuery}
                searchResults={searchResults}
                onSearchChange={onSearchChange}
                onResultSelect={(selection) => {
                  onResultSelect(selection);
                  setPhoneSearchOpen(false);
                }}
                placeholder="Search the map…"
              />
              <button
                type="button"
                className={iconButtonClass}
                aria-label="Close search"
                onClick={closePhoneSearch}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }
);
