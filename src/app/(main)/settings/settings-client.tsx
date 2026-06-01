"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Braces,
  Download,
  Sun,
  Moon,
  Tag,
  LogOut,
  BrainCircuit,
  KeyRound,
  Loader2,
  Palette,
  Search,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { Input } from "@/components/ui/input";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { SyncButton } from "@/components/sync-button";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useTheme, useFontMode, useOrbitalTheme } from "@/components/providers";
import { OrbitalBadge } from "@/components/orbital";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import {
  invalidateLibraryQueries,
  invalidateTagsQuery,
} from "@/lib/query-invalidation";
import { assignBalancedTagColors } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TagRow } from "./tag-row";
import { TagEditRow } from "./tag-edit-row";
import {
  OrbitReadyBadge,
  SETTINGS_SECTIONS,
  SettingsHero,
  SettingsNav,
  SettingsRow,
  SettingsSection,
  SettingsSegment,
} from "./settings-primitives";
import type { OrbitScanFailureCode, OrbitXaiStatusPayload } from "@/types";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { fontMode, setFontMode } = useFontMode();
  const { isOrbital, toggleOrbital } = useOrbitalTheme();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const orbitIssue = parseOrbitIssue(searchParams.get("orbitIssue"));

  const {
    data: tags = [],
    isLoading: tagsLoading,
    isError: tagsError,
    error: tagsErrorValue,
    refetch: refetchTags,
  } = useTagsQuery();

  const {
    data: collections = [],
    isError: collectionsError,
    error: collectionsErrorValue,
    refetch: refetchCollections,
  } = useCollectionsQuery();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [balancingTagColors, setBalancingTagColors] = useState(false);
  const balancedTags = useMemo(() => assignBalancedTagColors(tags), [tags]);
  const balancedTagColorUpdates = useMemo(
    () =>
      balancedTags.filter((tag, index) => tag.color !== tags[index]?.color),
    [balancedTags, tags]
  );
  const orbitStatusQuery = useQuery({
    queryKey: ["orbit", "xai-status", orbitIssue],
    queryFn: () =>
      fetchJson<OrbitXaiStatusPayload>(buildOrbitStatusUrl(orbitIssue)),
    staleTime: 30_000,
  });

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [tagSearch, tags]);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    if (!window.confirm("Delete this tag? It will be removed from all bookmarks.")) return;
    try {
      await sendJson("/api/tags", {
        method: "DELETE",
        body: { tagId },
      });
      await invalidateTagsQuery(queryClient);
      toast.success("Tag deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete tag"
      );
    }
  }, [queryClient]);

  const handleUpdateTag = useCallback(async (tagId: string, name: string, color: string) => {
    try {
      await sendJson("/api/tags", {
        method: "PATCH",
        body: { tagId, name, color },
      });
      await invalidateTagsQuery(queryClient);
      setEditingTag(null);
      toast.success("Tag updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update tag"
      );
    }
  }, [queryClient]);

  const handleStartEdit = useCallback((tag: { id: string; name: string; color: string }) => {
    setEditingTag(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTag(null);
  }, []);

  const handleBalanceTagColors = useCallback(async () => {
    if (balancedTagColorUpdates.length === 0) {
      toast.message("Tag colors already look balanced");
      return;
    }

    setBalancingTagColors(true);
    try {
      await Promise.all(
        balancedTagColorUpdates.map((tag) =>
          sendJson("/api/tags", {
            method: "PATCH",
            body: { tagId: tag.id, color: tag.color },
          })
        )
      );
      await invalidateTagsQuery(queryClient);
      setEditingTag(null);
      toast.success(
        `Balanced ${balancedTagColorUpdates.length} tag color${
          balancedTagColorUpdates.length === 1 ? "" : "s"
        }`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not balance tag colors"
      );
    } finally {
      setBalancingTagColors(false);
    }
  }, [balancedTagColorUpdates, queryClient]);

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const hasSettingsError = tagsError || collectionsError;
  const settingsErrorMessage =
    tagsErrorValue instanceof Error
      ? tagsErrorValue.message
      : collectionsErrorValue instanceof Error
        ? collectionsErrorValue.message
        : "Please try again.";

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={
            session?.dbUser?.lastSyncAt
              ? new Date(session.dbUser.lastSyncAt)
              : null
          }
          onSyncComplete={() => void invalidateLibraryQueries(queryClient, { refetchType: "all" })}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="app-main-scroll scrollbar-thin">
          <PageHeader
            sticky
            title="Settings"
            description="Account, sync, appearance, and tags"
            leading={
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={() => setCreateOpen(true)}
                  onSyncComplete={() => void invalidateLibraryQueries(queryClient, { refetchType: "all" })}
                />
              </div>
            }
            actions={
              session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : undefined
            }
          />

          <div className="p-4 sm:p-5">
            <div data-settings-page className="mx-auto max-w-4xl">
              <SettingsHero
                user={session?.dbUser}
                tagCount={tags.length}
                collectionCount={collections.length}
              />

              {hasSettingsError && (
                <ErrorState
                  layout="panel"
                  className="mt-5 max-w-none rounded-sm border-destructive/30 bg-destructive/5"
                  title="Settings data could not be loaded"
                  description={settingsErrorMessage}
                  action={
                    <RetryButton
                      onClick={() => {
                        void refetchTags();
                        void refetchCollections();
                      }}
                    />
                  }
                />
              )}

              <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-10">
                <aside className="hidden shrink-0 lg:block lg:w-36">
                  <SettingsNav className="sticky top-[calc(var(--header-height)+1.25rem)]" />
                </aside>

                <div className="min-w-0 flex-1 space-y-0">
                  <nav
                    aria-label="Settings sections"
                    className="mb-6 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {SETTINGS_SECTIONS.map(({ id, label }) => (
                      <a
                        key={id}
                        href={`#${id}`}
                        className="inline-flex h-8 shrink-0 items-center rounded-sm border border-hairline-soft px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground"
                      >
                        {label}
                      </a>
                    ))}
                  </nav>

                  <SettingsSection
                    id="connection"
                    icon={ShieldCheck}
                    title="Connection"
                    description="Read-only X access. Sync imports bookmarks and folders — nothing is posted for you."
                  >
                    <div className="space-y-3">
                      <ul className="space-y-1.5 text-xs text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                          Tokens are encrypted before storage.
                        </li>
                        <li className="flex items-start gap-2">
                          <BrainCircuit className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                          Orbit only calls Grok when you scan, then waits for approval.
                        </li>
                      </ul>
                      <SyncButton
                        lastSyncAt={
                          session?.dbUser?.lastSyncAt
                            ? new Date(session.dbUser.lastSyncAt)
                            : null
                        }
                        onSyncComplete={() =>
                          void invalidateLibraryQueries(queryClient, { refetchType: "all" })
                        }
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    id="orbit-grok"
                    icon={BrainCircuit}
                    title="Orbit Grok"
                    description="Server-side xAI configuration for scan and review."
                    badge={<OrbitReadyBadge status={orbitStatusQuery.data} />}
                  >
                    <OrbitGrokStatusPanel
                      status={orbitStatusQuery.data}
                      loading={orbitStatusQuery.isLoading}
                      error={orbitStatusQuery.error}
                      onRetry={() => void orbitStatusQuery.refetch()}
                    />
                  </SettingsSection>

                  <SettingsSection
                    id="appearance"
                    icon={theme === "dark" ? Moon : Sun}
                    title="Appearance"
                  >
                    <div className="rounded-sm border border-hairline-soft bg-surface-2/40 px-4">
                      <SettingsRow label="Color mode" divider={false}>
                        <div className="flex flex-col items-end gap-1.5">
                          <SettingsSegment
                            ariaLabel="Color mode"
                            value={theme}
                            options={[
                              { value: "dark" as const, label: "Dark" },
                              { value: "light" as const, label: "Light" },
                            ]}
                            onChange={setTheme}
                          />
                          {isOrbital ? (
                            <p className="max-w-[16rem] text-right text-[10px] text-muted-foreground/70">
                              Light uses the Polar Observatory palette when Orbit theme is on.
                            </p>
                          ) : null}
                        </div>
                      </SettingsRow>
                      <SettingsRow label="Typography">
                        <SettingsSegment
                          ariaLabel="Typography"
                          value={fontMode}
                          options={[
                            { value: "default" as const, label: "Sans" },
                            { value: "mono" as const, label: "Mono" },
                          ]}
                          onChange={setFontMode}
                        />
                      </SettingsRow>
                      <SettingsRow label="Orbit theme" divider={false}>
                        <div className="flex flex-wrap items-center gap-2">
                          {isOrbital ? <OrbitalBadge tone="cyan">Active</OrbitalBadge> : null}
                          <Button
                            variant={isOrbital ? "default" : "outline"}
                            size="sm"
                            onClick={toggleOrbital}
                            className="border-hairline-soft"
                          >
                            {isOrbital ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </SettingsRow>
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    id="export"
                    icon={Download}
                    title="Export"
                    description="Download bookmarks with tags and notes."
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                      <ExportLink
                        icon={Braces}
                        title="JSON"
                        href="/api/export?format=json"
                      />
                      <ExportLink
                        icon={Table2}
                        title="CSV"
                        href="/api/export?format=csv"
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    id="account"
                    icon={LogOut}
                    title="Account"
                    tone="danger"
                  >
                    <SettingsRow
                      label="Sign out"
                      description="Clears this browser session. Your synced data stays until you revoke access on X."
                      divider={false}
                    >
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        onClick={() => signOut({ callbackUrl: "/" })}
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </Button>
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection
                    id="tags"
                    icon={Tag}
                    title="Tags"
                    description="Rename, recolor, or balance tags across your library."
                    action={
                      tags.length > 1 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-hairline-soft"
                          onClick={handleBalanceTagColors}
                          disabled={
                            balancingTagColors || balancedTagColorUpdates.length === 0
                          }
                        >
                          {balancingTagColors ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Palette className="size-3.5" />
                          )}
                          Balance colors
                        </Button>
                      ) : null
                    }
                  >
                    {tags.length > 0 ? (
                      <div className="relative mb-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags…"
                          className="h-9 border-hairline-soft bg-surface-2 pl-9"
                          aria-label="Search tags"
                        />
                      </div>
                    ) : null}

                    {tagsLoading ? (
                      <TagListSkeleton />
                    ) : tags.length === 0 ? (
                      <div className="rounded-sm border border-dashed border-hairline-soft px-4 py-10 text-center">
                        <Tag className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                        <p className="text-sm font-medium">No tags yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tags appear here as you organize bookmarks on the dashboard.
                        </p>
                      </div>
                    ) : filteredTags.length === 0 ? (
                      <div className="rounded-sm border border-hairline-soft px-4 py-6 text-center text-sm text-muted-foreground">
                        No tags match &ldquo;{tagSearch.trim()}&rdquo;
                      </div>
                    ) : (
                      <div className="max-h-[min(28rem,50vh)] overflow-y-auto rounded-sm border border-hairline-soft bg-surface-2/50">
                        {filteredTags.map((tag, index) =>
                          editingTag === tag.id ? (
                            <TagEditRow
                              key={tag.id}
                              tag={tag}
                              index={index}
                              initialName={editTagName}
                              initialColor={editTagColor}
                              onSave={handleUpdateTag}
                              onCancel={handleCancelEdit}
                            />
                          ) : (
                            <TagRow
                              key={tag.id}
                              tag={tag}
                              index={index}
                              onStartEdit={handleStartEdit}
                              onDelete={handleDeleteTag}
                            />
                          )
                        )}
                      </div>
                    )}

                    {!tagsLoading && tags.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {filteredTags.length.toLocaleString()} of {tags.length.toLocaleString()} tags
                        {tagSearch.trim() ? " shown" : ""}
                      </p>
                    ) : null}
                  </SettingsSection>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </div>
  );
}

function ExportLink({
  icon: Icon,
  title,
  href,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex flex-1 items-center gap-2 rounded-sm border border-hairline-soft px-3 py-2.5 text-sm font-medium transition-colors",
        "hover:border-primary/25 hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <Icon className="size-4 text-primary" aria-hidden />
      Download {title}
    </a>
  );
}

function TagListSkeleton() {
  return (
    <div className="space-y-0 rounded-sm border border-hairline-soft">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 px-4 py-3",
            i > 0 && "border-t border-hairline-soft"
          )}
        >
          <div className="size-3.5 rounded-full skeleton-shimmer" />
          <div className="h-3 w-24 flex-1 rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

function parseOrbitIssue(value: string | null): OrbitScanFailureCode | null {
  return value === "xai_auth" || value === "xai_model" ? value : null;
}

function buildOrbitStatusUrl(issue: OrbitScanFailureCode | null) {
  if (!issue) return "/api/orbit/status";
  const params = new URLSearchParams({ lastFailure: issue });
  return `/api/orbit/status?${params.toString()}`;
}

function OrbitGrokStatusPanel({
  status,
  loading,
  error,
  onRetry,
}: {
  status: OrbitXaiStatusPayload | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded skeleton-shimmer" />
        ))}
      </dl>
    );
  }

  if (error || !status) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {error?.message ?? "Orbit status could not be checked."}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const privacyLabel = status.privacy.storeDisabled
    ? "Response storage off"
    : "Response storage on";
  const zeroDataRetentionLabel =
    status.privacy.zeroDataRetention === true
      ? "Zero retention"
      : status.privacy.zeroDataRetention === false
        ? "Retention active"
        : "Retention unknown";

  return (
    <div className="space-y-3">
      {status.issues.length > 0 ? (
        <div className="rounded-sm border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-200" />
            <div className="space-y-2">
              {status.issues.map((issue) => (
                <div key={issue.code}>
                  <p className="text-sm font-medium text-foreground">{issue.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {issue.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <OrbitStatusRow
          label="Model"
          value={`${status.model}${status.modelSource === "environment" ? " · env" : ""}`}
        />
        <OrbitStatusRow
          label="Privacy"
          value={`${privacyLabel} · ${zeroDataRetentionLabel}`}
        />
        <OrbitStatusRow
          label="xAI key"
          value={status.apiKeyConfigured ? "Configured" : "Missing"}
          highlight={!status.apiKeyConfigured}
        />
        <OrbitStatusRow
          label="Endpoint"
          value={`${status.baseUrl}${status.baseUrlSource === "environment" ? " · env" : ""}`}
        />
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onRetry}>
          Refresh
        </Button>
        <Link
          href="/orbit"
          className="inline-flex h-8 items-center rounded-sm px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open Orbit queue
        </Link>
      </div>
    </div>
  );
}

function OrbitStatusRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(highlight && "text-amber-700 dark:text-amber-200")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-foreground">{value}</dd>
    </div>
  );
}
