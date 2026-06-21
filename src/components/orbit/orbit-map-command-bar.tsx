"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { buttonVariants } from "@/components/ui/button";
import { PageHeaderCompactToggle } from "@/components/page-header-compact-toggle";
import { CompactFloatingSearchBubble } from "@/components/compact-floating-search";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import {
  FeedCompactToolbarShell,
  FeedToolbarControlsRow,
  FeedToolbarRow,
  FeedToolbarSearchRow,
} from "@/components/feed-toolbar-layout";
import { OrbitMapGraphSearch } from "@/components/orbit/orbit-map-graph-search";
import { OrbitMapLegendButton } from "@/components/orbit/orbit-map-legend-button";
import { OrbitMapPageIdentity } from "@/components/orbit/orbit-map-page-identity";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import { appContentGutterClassName, appToolbarSurfaceClassName } from "@/lib/app-chrome";
import { orbitDataClass } from "@/lib/orbit-route-chrome";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
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

  const graphSearch = (
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
  );

  const userNav = user ? (
    <UserNavDynamic user={user} avatarSize={compact ? "lg" : "xl"} />
  ) : null;

  const scopeControl = (
    <OrbitMapScopeMenu
      graphScope={graphScope}
      isLoading={isLoading}
      onScopeChange={onScopeChange}
      className={cn(appToolbarSurfaceClassName, compact ? "h-8" : "h-9")}
    />
  );

  const toolbarActions = (
    <>
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
    </>
  );

  if (compact) {
    return (
      <>
        <FeedCompactToolbarShell>
          <FeedToolbarRow
            leading={
              <>
                {mobileSidebar ? (
                  <div className="shrink-0 md:hidden">{mobileSidebar}</div>
                ) : null}
                {scopeControl}
              </>
            }
            actions={toolbarActions}
            userNav={userNav}
          />
        </FeedCompactToolbarShell>
        <CompactFloatingSearchBubble>{graphSearch}</CompactFloatingSearchBubble>
      </>
    );
  }

  return (
    <div
      className={cn(
        "feed-toolbar relative w-full min-w-0 space-y-1.5 py-2",
        appContentGutterClassName
      )}
    >
      <FeedToolbarSearchRow
        leading={
          <>
            {mobileSidebar ? (
              <div className="shrink-0 md:hidden">{mobileSidebar}</div>
            ) : null}
            <OrbitMapPageIdentity />
          </>
        }
        search={graphSearch}
        userNav={userNav}
      />
      <FeedToolbarControlsRow
        leading={scopeControl}
        actions={toolbarActions}
        mobileUserNav={userNav}
      />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-0.5 text-xs text-muted-foreground">
        <span className={cn(orbitDataClass(), "normal-case")}>{description}</span>
        {isFetching ? (
          <span className="flex shrink-0 items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Updating graph
          </span>
        ) : null}
      </div>
    </div>
  );
});
