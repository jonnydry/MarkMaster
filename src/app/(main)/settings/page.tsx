"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Download,
  Trash2,
  Sun,
  Moon,
  Tag,
  LogOut,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNav } from "@/components/user-nav";
import { useTheme } from "@/components/providers";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { PRESET_COLORS } from "@/lib/constants";
import { sendJson } from "@/lib/fetch-json";
import {
  invalidateLibraryQueries,
  invalidateTagsQuery,
} from "@/lib/query-invalidation";
import { toast } from "sonner";
import type { DbUser } from "@/lib/auth";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: tags = [],
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

  const handleDeleteTag = async (tagId: string) => {
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
  };

  const handleUpdateTag = async (tagId: string) => {
    try {
      await sendJson("/api/tags", {
        method: "PATCH",
        body: { tagId, name: editTagName, color: editTagColor },
      });
      await invalidateTagsQuery(queryClient);
      setEditingTag(null);
      toast.success("Tag updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update tag"
      );
    }
  };

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
    <div className="app-shell-bg flex h-screen overflow-hidden">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader
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
          actions={session?.dbUser ? <UserNav user={session.dbUser} /> : undefined}
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
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
              <div className="mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                <h2 className="font-semibold heading-font">Manage Tags</h2>
              </div>
              {tags.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-hairline-soft bg-surface-2 px-4 py-10 text-center">
                  <Tag className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">No tags yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tags will appear here as you organize bookmarks.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-hairline-soft bg-surface-2">
                  {tags.map((tag, index) => (
                    <div
                      key={tag.id}
                      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                        index > 0 ? "border-t border-hairline-soft" : ""
                      }`}
                    >
                      {editingTag === tag.id ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c}
                                aria-label={`Select color ${c}`}
                                aria-pressed={editTagColor === c}
                                className={`h-6 w-6 rounded-full border transition-transform ${
                                  editTagColor === c
                                    ? "scale-105 border-foreground ring-2 ring-foreground/30 ring-offset-2 ring-offset-surface-2"
                                    : "border-black/10"
                                }`}
                                style={{ backgroundColor: c }}
                                onClick={() => setEditTagColor(c)}
                              />
                            ))}
                          </div>
                          <Input
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            className="h-8 min-w-[12rem] flex-1 border-hairline-soft bg-surface-1"
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleUpdateTag(tag.id)
                            }
                          />
                            <Button size="sm" className="shadow-sm" onClick={() => handleUpdateTag(tag.id)}>
                              Save
                            </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTag(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <div
                            className="h-4 w-4 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="flex-1 text-sm font-medium">{tag.name}</span>
                          <span className="rounded-full border border-hairline-soft bg-surface-1 px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
                            {tag._count.bookmarks}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:bg-surface-1 hover:text-foreground"
                            onClick={() => {
                              setEditingTag(tag.id);
                              setEditTagName(tag.name);
                              setEditTagColor(tag.color);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            aria-label={`Delete tag ${tag.name}`}
                            onClick={() => handleDeleteTag(tag.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
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
