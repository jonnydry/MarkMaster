"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Braces,
  Download,
  Sun,
  Moon,
  LogOut,
  BrainCircuit,
  KeyRound,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";
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
import { ColorThemePicker } from "@/components/color-theme-picker";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery } from "@/hooks/use-library-data";
import { useSettingsTags } from "@/hooks/use-settings-tags";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
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
      { id: "orbit-grok", keys: ["2"], label: "Orbit Grok" },
      { id: "appearance", keys: ["3"], label: "Appearance" },
      { id: "export", keys: ["4"], label: "Export" },
      { id: "tags", keys: ["5"], label: "Tags" },
      { id: "account", keys: ["6"], label: "Account" },
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
  const { fontMode, setFontMode } = useFontMode();
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

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient, { refetchType: "all" });
    void updateSession({ refresh: "lastSyncAt" });
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
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={lastSyncAt}
          onSyncComplete={handleSyncComplete}
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
                        lastSyncAt={lastSyncAt}
                        onSyncComplete={handleSyncComplete}
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
                      <SettingsRow label="Typography" divider={false}>
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
