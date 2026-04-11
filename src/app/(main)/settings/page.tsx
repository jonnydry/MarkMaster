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
import { Separator } from "@/components/ui/separator";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Sidebar } from "@/components/sidebar";
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={() => setCreateOpen(true)}
                onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
              />
              <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            </div>
            {session?.dbUser && (
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <UserNav user={session.dbUser} />
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-6">
          {(tagsError || collectionsError) && (
            <Card className="p-5 border-destructive/30">
              <h2 className="font-semibold mb-2">Settings data could not be loaded</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {tagsErrorValue instanceof Error
                  ? tagsErrorValue.message
                  : collectionsErrorValue instanceof Error
                    ? collectionsErrorValue.message
                    : "Please try again."}
              </p>
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

          <Card className="p-5">
            <h2 className="font-semibold mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Switch between dark and light mode
                </p>
              </div>
              <Button variant="outline" onClick={toggleTheme} className="gap-2">
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
                {theme === "dark" ? "Light" : "Dark"}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Manage Tags
            </h2>
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags yet</p>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-3 py-2">
                    {editingTag === tag.id ? (
                      <>
                        <div className="flex gap-1">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              className={`w-5 h-5 rounded-full ${
                                editTagColor === c
                                  ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                                  : ""
                              }`}
                              style={{ backgroundColor: c }}
                              onClick={() => setEditTagColor(c)}
                            />
                          ))}
                        </div>
                        <Input
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          className="flex-1 h-8"
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleUpdateTag(tag.id)
                          }
                        />
                        <Button size="sm" onClick={() => handleUpdateTag(tag.id)}>
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
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 text-sm">{tag.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {tag._count.bookmarks}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
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
                          className="h-8 w-8 text-destructive"
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

          <Card className="p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Download all your bookmarks with tags and notes.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/export?format=json"; }}>
                Export as JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/export?format=csv"; }}>
                Export as CSV
              </Button>
            </div>
          </Card>

          <Separator />

          <Card className="p-5 border-destructive/30">
            <h2 className="font-semibold mb-4 text-destructive">Danger Zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-sm text-muted-foreground">
                  Disconnect your X account
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
          </Card>
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
