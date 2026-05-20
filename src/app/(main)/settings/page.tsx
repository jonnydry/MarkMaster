"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Download,
  Sun,
  Moon,
  Tag,
  LogOut,
  BrainCircuit,
  KeyRound,
  Loader2,
  Palette,
  ServerCog,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  const { theme, toggleTheme } = useTheme();
  const { fontMode, toggleFontMode } = useFontMode();
  const { isOrbital, toggleOrbital } = useOrbitalTheme();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
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
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
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
          onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="app-main-scroll scrollbar-thin">
          <PageHeader
            sticky
            title="Settings"
            description="Appearance, tags, exports, and account controls"
            leading={
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={() => setCreateOpen(true)}
                  onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
                />
              </div>
            }
            actions={
              session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : undefined
            }
          />

          <div className="p-4 sm:p-5">
            <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-5">
              {hasSettingsError && (
                <Card className="border-destructive/30 bg-surface-1 p-5 shadow-sm">
                  <h2 className="mb-2 font-semibold">Settings data could not be loaded</h2>
                  <p className="mb-4 text-sm text-muted-foreground">{settingsErrorMessage}</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      void refetchTags();
                      void refetchCollections();
                    }}
                  >
                    Retry
                  </Button>
                </Card>
              )}

              <Card className="border-hairline-soft bg-surface-1 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold heading-font">Connection & Trust</h2>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-hairline-soft bg-surface-2 p-4">
                    <p className="text-sm font-medium">
                      {session?.dbUser?.username
                        ? `Connected to @${session.dbUser.username}`
                        : "X account connection"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      MarkMaster requests read-only bookmark access. Sync imports
                      bookmarks and X folders into your searchable archive.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TrustItem
                      icon={KeyRound}
                      label="Encrypted tokens"
                      copy="Access and refresh tokens are encrypted before storage."
                    />
                    <TrustItem
                      icon={BrainCircuit}
                      label="Review-first AI"
                      copy="Orbit asks Grok only when you scan, then waits for approval."
                    />
                  </div>
                  <SyncButton
                    lastSyncAt={
                      session?.dbUser?.lastSyncAt
                        ? new Date(session.dbUser.lastSyncAt)
                        : null
                    }
                    onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
                    detail="full"
                  />
                </div>
              </Card>

              <Card
                id="orbit-grok"
                className="scroll-mt-24 border-hairline-soft bg-surface-1 p-5 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold heading-font">Orbit Grok</h2>
                  </div>
                  <OrbitStatusBadge status={orbitStatusQuery.data} />
                </div>
                <OrbitGrokStatusPanel
                  status={orbitStatusQuery.data}
                  loading={orbitStatusQuery.isLoading}
                  error={orbitStatusQuery.error}
                  onRetry={() => void orbitStatusQuery.refetch()}
                />
              </Card>

              <Card className="border-hairline-soft bg-surface-1 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  {theme === "dark" ? (
                    <Moon className="w-4 h-4 text-primary" />
                  ) : (
                    <Sun className="w-4 h-4 text-primary" />
                  )}
                  <h2 className="font-semibold heading-font">Appearance</h2>
                </div>
                <div className="rounded-2xl border border-hairline-soft bg-surface-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <Label>Theme</Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Switch between dark and light mode.
                      </p>
                    </div>
                    <Button variant="outline" onClick={toggleTheme} className="gap-2 border-hairline-soft bg-surface-1 shadow-sm">
                      {theme === "dark" ? (
                        <Sun className="w-4 h-4" />
                      ) : (
                        <Moon className="w-4 h-4" />
                      )}
                      {theme === "dark" ? "Light" : "Dark"}
                    </Button>
                  </div>
                  <div className="mt-3 border-t border-hairline-soft pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <Label>Typography</Label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Toggle global monospace (JetBrains Mono) for terminal-style UI. Preserves hierarchy and works seamlessly with Orbital theme.
                        </p>
                      </div>
                      <Button variant="outline" onClick={toggleFontMode} className="gap-2 border-hairline-soft bg-surface-1 shadow-sm">
                        {fontMode === "mono" ? "Default" : "Monospace"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-hairline-soft pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Label>Orbital Theme</Label>
                          {isOrbital && <OrbitalBadge tone="cyan">Active</OrbitalBadge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Enable the full futuristic minimalism design language: deep void surfaces, cyan-teal orbital glow, warm bronze accents, inner-glow glassmorphism, independent ring motion, and JetBrains Mono as the primary telemetry voice. Transforms the interface into a calm personal orbital intelligence system with two-column mission control.
                        </p>
                      </div>
                      <Button
                        variant={isOrbital ? "default" : "outline"}
                        onClick={toggleOrbital}
                        className="gap-2 border-hairline-soft bg-surface-1 shadow-sm"
                      >
                        {isOrbital ? "Disable Orbital" : "Enable Orbital"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border-hairline-soft bg-surface-1 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold heading-font">Export</h2>
                </div>
                <div className="rounded-2xl border border-hairline-soft bg-surface-2 p-4">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Download all your bookmarks with tags and notes.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-hairline-soft bg-surface-1 shadow-sm"
                      onClick={() => {
                        window.location.href = "/api/export?format=json";
                      }}
                    >
                      Export as JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-hairline-soft bg-surface-1 shadow-sm"
                      onClick={() => {
                        window.location.href = "/api/export?format=csv";
                      }}
                    >
                      Export as CSV
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="border-destructive/30 bg-surface-1 p-5 shadow-sm">
                <h2 className="mb-4 font-semibold heading-font text-destructive">Danger Zone</h2>
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Sign out</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Disconnect your X account.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => signOut({ callbackUrl: "/" })}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

              <Card className="border-hairline-soft bg-surface-1 p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold heading-font">Manage Tags</h2>
                  </div>
                  {tags.length > 1 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-hairline-soft bg-surface-2 shadow-sm"
                      onClick={handleBalanceTagColors}
                      disabled={
                        balancingTagColors ||
                        balancedTagColorUpdates.length === 0
                      }
                    >
                      {balancingTagColors ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Palette className="size-3.5" />
                      )}
                      Balance colors
                    </Button>
                  ) : null}
                </div>
                {tagsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl border border-hairline-soft bg-surface-1 px-4 py-3"
                      >
                        <div className="h-5 w-5 rounded-full skeleton-shimmer" />
                        <div className="h-3 w-24 rounded skeleton-shimmer" />
                        <div className="ml-auto h-3 w-16 rounded skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                ) : tags.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-hairline-soft bg-surface-2 px-4 py-10 text-center">
                  <Tag className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">No tags yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tags will appear here as you organize bookmarks.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-hairline-soft bg-surface-2">
                  {tags.map((tag, index) =>
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
            </Card>
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

function TrustItem({
  icon: Icon,
  label,
  copy,
}: {
  icon: LucideIcon;
  label: string;
  copy: string;
}) {
  return (
    <div className="rounded-xl border border-hairline-soft bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
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

function OrbitStatusBadge({
  status,
}: {
  status: OrbitXaiStatusPayload | undefined;
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-hairline-soft bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
        Checking
      </span>
    );
  }

  const ready = status.state === "ready";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        ready
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
          : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-100"
      )}
    >
      {ready ? "Ready" : "Misconfigured"}
    </span>
  );
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
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-2xl border border-hairline-soft bg-surface-2 skeleton-shimmer"
          />
        ))}
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Orbit status could not be checked
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error?.message ?? "Please try again."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const privacyLabel = status.privacy.storeDisabled
    ? "Response storage disabled"
    : "Response storage enabled";
  const zeroDataRetentionLabel =
    status.privacy.zeroDataRetention === true
      ? "Zero data retention confirmed"
      : status.privacy.zeroDataRetention === false
        ? "Zero data retention not active"
        : "Zero data retention not reported";

  return (
    <div className="space-y-3">
      {status.issues.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-200" />
            <div className="space-y-2">
              {status.issues.map((issue) => (
                <div key={issue.code}>
                  <p className="text-sm font-medium text-foreground">
                    {issue.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {issue.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <OrbitStatusItem
          icon={Sparkles}
          label="Grok model"
          value={`${status.model} ${
            status.modelSource === "environment" ? "from env" : "default"
          }`}
        />
        <OrbitStatusItem
          icon={ShieldCheck}
          label="Privacy"
          value={`${privacyLabel} · ${zeroDataRetentionLabel}`}
        />
        <OrbitStatusItem
          icon={KeyRound}
          label="xAI key"
          value={status.apiKeyConfigured ? "Configured" : "Missing"}
        />
        <OrbitStatusItem
          icon={ServerCog}
          label="Endpoint"
          value={`${status.baseUrl} ${
            status.baseUrlSource === "environment" ? "from env" : "default"
          }`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onRetry}>
          Refresh status
        </Button>
        <Link
          href="/orbit"
          className="inline-flex h-7 items-center justify-center rounded-md border border-hairline-soft bg-transparent px-2.5 text-[0.8rem] font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-accent-soft"
        >
          Return to Orbit
        </Link>
      </div>
    </div>
  );
}

function OrbitStatusItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-hairline-soft bg-surface-2 p-3">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}
