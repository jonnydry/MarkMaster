"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Braces,
  Check,
  Download,
  Sun,
  Moon,
  LogOut,
  BrainCircuit,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { AppPageShell } from "@/components/app-page-shell";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { SyncButton } from "@/components/sync-button";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { useTheme, useFontMode, useColorTheme } from "@/components/providers";
import {
  highlightIndicatorActiveClass,
  highlightSurfaceActiveClass,
} from "@/lib/highlight-chrome";
import { ColorThemePicker } from "@/components/color-theme-picker";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery } from "@/hooks/use-library-data";
import { useSettingsTags } from "@/hooks/use-settings-tags";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { completeLibrarySync } from "@/lib/library-sync";
import { useSyncSettings } from "@/hooks/use-sync-settings";
import {
  TYPOGRAPHY_PRESETS,
  type TypographyPresetId,
} from "@/lib/typography-presets";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  OrbitGrokStatusPanel,
  parseOrbitIssue,
  useOrbitStatusQuery,
} from "./settings-orbit-status-panel";
import { SettingsTagsSection } from "./settings-tags-section";
import {
  OrbitReadyBadge,
  SETTINGS_SECTIONS,
  SettingsHero,
  SettingsNav,
  SettingsRow,
  SettingsSection,
  SettingsSegment,
} from "./settings-primitives";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

const SETTINGS_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Sections",
    shortcuts: [
      { id: "connection", keys: ["1"], label: "Connection" },
      { id: "sync", keys: ["2"], label: "Sync" },
      { id: "orbit-grok", keys: ["3"], label: "Orbit Grok" },
      { id: "appearance", keys: ["4"], label: "Appearance" },
      { id: "export", keys: ["5"], label: "Export" },
      { id: "tags", keys: ["6"], label: "Tags" },
      { id: "account", keys: ["7"], label: "Account" },
    ],
  },
  {
    title: "Settings Actions",
    shortcuts: [
      { id: "search-tags", keys: ["/"], label: "Search tags" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update: updateSession } = useSession();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { typographyPreset, setTypographyPreset } = useFontMode();
  const { colorTheme, setColorTheme } = useColorTheme();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const tagSearchRef = useRef<HTMLInputElement>(null);
  const orbitIssue = parseOrbitIssue(searchParams.get("orbitIssue"));
  const dbUser = session?.dbUser;
  const lastSyncAt = dbUser?.lastSyncAt ? new Date(dbUser.lastSyncAt) : null;

  const tagsState = useSettingsTags();
  const { tags, tagsError, tagsErrorValue, refetchTags } = tagsState;

  const {
    data: collections = [],
    isError: collectionsError,
    error: collectionsErrorValue,
    refetch: refetchCollections,
  } = useCollectionsQuery();

  const orbitStatusQuery = useOrbitStatusQuery(orbitIssue);
  const {
    syncXFolders,
    setSyncXFolders,
    isUpdating: isUpdatingSyncSettings,
  } = useSyncSettings();

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const handleSyncComplete = useCallback(() => {
    completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, updateSession]);

  const scrollToSettingsSection = useCallback((sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  }, []);

  useSurfaceKeyboardShortcuts({
    shortcutGroups: SETTINGS_SHORTCUT_GROUPS,
    actions: {
      connection: () => scrollToSettingsSection("connection"),
      sync: () => scrollToSettingsSection("sync"),
      "orbit-grok": () => scrollToSettingsSection("orbit-grok"),
      appearance: () => scrollToSettingsSection("appearance"),
      export: () => scrollToSettingsSection("export"),
      tags: () => scrollToSettingsSection("tags"),
      account: () => scrollToSettingsSection("account"),
      "search-tags": () => {
        scrollToSettingsSection("tags");
        requestAnimationFrame(() => tagSearchRef.current?.focus());
      },
      shortcuts: () => setKeyboardShortcutsOpen(true),
    },
  });

  const hasSettingsError = tagsError || collectionsError;
  const settingsErrorMessage =
    tagsErrorValue instanceof Error
      ? tagsErrorValue.message
      : collectionsErrorValue instanceof Error
        ? collectionsErrorValue.message
        : "Please try again.";

  return (
    <>
    <AppPageShell
      sidebar={
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={lastSyncAt}
          onSyncComplete={handleSyncComplete}
        />
      }
    >
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
                  lastSyncAt={lastSyncAt}
                  onSyncComplete={handleSyncComplete}
                />
              </div>
            }
            actions={
              <>
                <KeyboardShortcutsHelpButton
                  open={keyboardShortcutsOpen}
                  onOpenChange={setKeyboardShortcutsOpen}
                  groups={SETTINGS_SHORTCUT_GROUPS}
                  description="Settings section navigation and tag search shortcuts."
                />
                {dbUser ? <UserNavDynamic user={dbUser} /> : null}
              </>
            }
          />

          <div className="p-4 sm:p-5">
            <div data-settings-page className="mx-auto max-w-4xl">
              <SettingsHero
                user={dbUser}
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
                        className="inline-flex h-8 shrink-0 items-center rounded-sm border border-hairline-soft px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                      >
                        {label}
                      </a>
                    ))}
                  </nav>

                  <SettingsSection
                    id="connection"
                    icon={ShieldCheck}
                    title="Connection"
                    description="Read-only X access. Sync imports bookmarks — nothing is posted for you."
                  >
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
                  </SettingsSection>

                  <SettingsSection
                    id="sync"
                    icon={RefreshCw}
                    title="Sync"
                    description="Pull new bookmarks from X. Head sync is fast; optional folder scanning takes longer."
                  >
                    <div className="surface-inset px-4">
                      <SettingsRow
                        label="Scan X bookmark folders"
                        description="Mirrors your X folders into synced collections. Adds extra API calls and may make sync take a bit longer."
                        divider={false}
                      >
                        <Switch
                          checked={syncXFolders}
                          disabled={isUpdatingSyncSettings}
                          aria-label="Scan X bookmark folders when syncing"
                          onCheckedChange={(checked) => setSyncXFolders(checked)}
                        />
                      </SettingsRow>
                      <div className="border-t border-hairline-soft py-3">
                        <SyncButton
                          lastSyncAt={lastSyncAt}
                          onSyncComplete={handleSyncComplete}
                          detail="full"
                        />
                      </div>
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
                    <div className="surface-inset px-4">
                      <SettingsRow label="Color mode" divider={false}>
                        <SettingsSegment
                          ariaLabel="Color mode"
                          value={theme}
                          options={[
                            { value: "dark" as const, label: "Dark" },
                            { value: "light" as const, label: "Light" },
                          ]}
                          onChange={setTheme}
                        />
                      </SettingsRow>
                      <SettingsRow label="Accent color">
                        <ColorThemePicker value={colorTheme} onChange={setColorTheme} />
                      </SettingsRow>
                      <div className="border-t border-hairline-soft py-3">
                        <div className="max-w-prose">
                          <p className="text-sm font-medium text-foreground">
                            Typography
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Choose a cohesive type system for body text,
                            headings, labels, and data.
                          </p>
                        </div>
                        <TypographyPresetPicker
                          value={typographyPreset}
                          onChange={setTypographyPreset}
                        />
                      </div>
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

                  <SettingsTagsSection {...tagsState} tagSearchRef={tagSearchRef} />
                </div>
              </div>
            </div>
          </div>
    </AppPageShell>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </>
  );
}

function TypographyPresetPicker({
  value,
  onChange,
}: {
  value: TypographyPresetId;
  onChange: (value: TypographyPresetId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Typography family"
      className="mt-3 grid gap-2 sm:grid-cols-2"
    >
      {TYPOGRAPHY_PRESETS.map((preset) => {
        const selected = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${preset.name} typography preset`}
            data-typography-preset={preset.id}
            onClick={() => onChange(preset.id)}
            className={cn(
              "min-h-[6.25rem] rounded-sm border p-3 text-left font-sans transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? highlightSurfaceActiveClass
                : "border-hairline-soft bg-background/30 hover:border-primary/25 hover:bg-accent-soft/50"
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="heading-font truncate text-sm font-semibold text-foreground">
                  {preset.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {preset.description}
                </p>
              </div>
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected
                    ? highlightIndicatorActiveClass
                    : "border-hairline-strong text-transparent"
                )}
                aria-hidden
              >
                <Check className="size-3" />
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="min-w-0">
                <p className="heading-font truncate text-[15px] font-semibold text-foreground">
                  Signal Library
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {preset.previewCopy}
                </p>
              </div>
              <span className="font-data text-xs text-muted-foreground">
                128
              </span>
            </div>

            <p className="font-label mt-2 truncate text-2xs font-medium uppercase text-primary">
              {preset.bodyFace} / {preset.dataFace}
            </p>
          </button>
        );
      })}
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
