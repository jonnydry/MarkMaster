"use client";

import { forwardRef, type ReactNode } from "react";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { OrbitModeSwitch } from "@/components/orbit/orbit-mode-switch";
import { OrbitMapGraphSearch } from "@/components/orbit/orbit-map-graph-search";
import { OrbitMapLegendButton } from "@/components/orbit/orbit-map-legend-button";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import type { DbUser } from "@/lib/auth";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode, OrbitGraphScope } from "@/types";
import { cn } from "@/lib/utils";

export interface OrbitMapConsoleProps {
  mobileSidebar?: ReactNode;
  user?: DbUser;
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
  /** Shift the top-right tools left to clear the docked inspector. */
  toolsShifted?: boolean;
}

const controlOnGlassClass =
  "h-8 border-transparent bg-transparent hover:bg-accent-soft";

/**
 * The Orbit map's chrome, dissolved out of a top toolbar into two floating
 * `.map-glass` corner clusters over the space canvas:
 *  - top-left: identity + Queue⇄Map switch + graph scope
 *  - top-right: graph search + legend + shortcuts + user + mobile sidebar
 *
 * The All/Loose/Recent filter and zoom cluster continue to float from inside
 * the canvas host; this console owns everything that used to live in the header.
 */
export const OrbitMapConsole = forwardRef<HTMLInputElement, OrbitMapConsoleProps>(
  function OrbitMapConsole(
    {
      mobileSidebar,
      user,
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
      toolsShifted = false,
    },
    searchRef
  ) {
    return (
      <>
        {/* Top-left — identity, mode switch, scope. */}
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] sm:left-4 sm:top-4">
          <div
            className={cn(
              orbitMapFloatingShellClass(),
              "pointer-events-auto flex min-w-0 items-center gap-2 px-2 py-1.5"
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center text-primary">
              <OrbitLogoMark className="size-4" />
            </span>
            <span className="heading-font hidden text-sm font-bold tracking-tight text-foreground sm:inline">
              Orbit
            </span>
            <span className="h-5 w-px shrink-0 bg-hairline-soft" />
            <OrbitModeSwitch active="map" size="md" />
            <OrbitMapScopeMenu
              graphScope={graphScope}
              isLoading={isLoading}
              onScopeChange={onScopeChange}
              className={controlOnGlassClass}
            />
          </div>
        </div>

        {/* Top-right — search + tools. Stays above the docked inspector (z-40). */}
        <div
          className={cn(
            "pointer-events-none absolute top-3 z-40 flex items-center gap-2 sm:top-4",
            toolsShifted ? "right-3 sm:right-4 lg:right-[22.5rem]" : "right-3 sm:right-4"
          )}
        >
          <div
            className={cn(
              orbitMapFloatingShellClass(),
              "pointer-events-auto flex w-[9.5rem] items-center px-1.5 py-1 sm:w-[15rem]"
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
            />
          </div>
          <div
            className={cn(
              orbitMapFloatingShellClass(),
              "pointer-events-auto flex items-center gap-1 px-1.5 py-1"
            )}
          >
            <OrbitMapLegendButton className={controlOnGlassClass} />
            <KeyboardShortcutsHelpButton
              open={keyboardShortcutsOpen}
              onOpenChange={onKeyboardShortcutsOpenChange}
              groups={shortcutGroups}
              description="Orbit graph search, view, and assignment shortcuts."
              toolbarSize="compact"
            />
            {mobileSidebar ? (
              <div className="shrink-0 md:hidden">{mobileSidebar}</div>
            ) : null}
            {user ? <UserNavDynamic user={user} avatarSize="default" /> : null}
          </div>
        </div>
      </>
    );
  }
);
