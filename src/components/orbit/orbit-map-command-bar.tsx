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
  withCompactToolbarSidebar,
} from "@/components/feed-toolbar-layout";
import { OrbitMapGraphSearch } from "@/components/orbit/orbit-map-graph-search";
import { OrbitMapLegendButton } from "@/components/orbit/orbit-map-legend-button";
import { OrbitMapPageIdentity } from "@/components/orbit/orbit-map-page-identity";
import { OrbitMapScopeMenu } from "@/components/orbit/orbit-map-scope-menu";
import {
  appContentGutterClassName,
  appToolbarControlExpandedClassName,
  appToolbarControlHeightClassName,
  appToolbarSurfaceClassName,
} from "@/lib/app-chrome";
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
      embedded={compact}
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
    <UserNavDynamic user={user} avatarSize={compact ? "default" : "xl"} />
  ) : null;

  const scopeControl = (
    <OrbitMapScopeMenu
      graphScope={graphScope}
      isLoading={isLoading}
      onScopeChange={onScopeChange}
      className={cn(
        appToolbarSurfaceClassName,
        appToolbarControlHeightClassName(compact)
      )}
    />
  );

  const toolbarActions = (
    <>
      <OrbitMapLegendButton
        className={cn(
          appToolbarSurfaceClassName,
          appToolbarControlHeightClassName(compact)
        )}
      />
      <KeyboardShortcutsHelpButton
        open={keyboardShortcutsOpen}
        onOpenChange={onKeyboardShortcutsOpenChange}
        groups={shortcutGroups}
        description="Orbit graph search, view, and assignment shortcuts."
        toolbarSize={compact ? "compact" : "default"}
      />
      <Link
        href="/orbit"
        aria-label="Back to Orbit queue"
        className={cn(
          buttonVariants({ variant: "outline", size: compact ? "sm" : "default" }),
          appToolbarSurfaceClassName,
          appToolbarControlHeightClassName(compact)
        )}
      >
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">Orbit queue</span>
      </Link>
      <PageHeaderCompactToggle
        className={cn(
          appToolbarSurfaceClassName,
          !compact && appToolbarControlExpandedClassName
        )}
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
                  <div className="shrink-0 md:hidden">
                    {withCompactToolbarSidebar(mobileSidebar, compact)}
                  </div>
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
              <div className="shrink-0 md:hidden">
                {withCompactToolbarSidebar(mobileSidebar, compact)}
              </div>
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
