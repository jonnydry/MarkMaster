"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
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
import { Sidebar } from "@/components/sidebar";
import { UserNav } from "@/components/user-nav";
import { useTheme } from "@/components/providers";
import { toast } from "sonner";
import type { TagWithCount, CollectionWithCount } from "@/types";
import type { DbUser } from "@/lib/auth";

const PRESET_COLORS = [
  "#1d9bf0",
  "#71717a",
  "#52525b",
  "#3f3f46",
  "#a1a1aa",
  "#27272a",
  "#d4d4d8",
  "#18181b",
];

export default function SettingsPage() {
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();

  const { data: tags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      return res.json();
    },
  });

  const { data: collections = [] } = useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await fetch("/api/collections");
      return res.json();
    },
  });

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");

  const handleDeleteTag = async (tagId: string) => {
    await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    toast.success("Tag deleted");
  };

  const handleUpdateTag = async (tagId: string) => {
    await fetch("/api/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId, name: editTagName, color: editTagColor }),
    });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    setEditingTag(null);
    toast.success("Tag updated");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tags={tags}
        collections={collections}
        selectedTags={[]}
        onTagToggle={() => {}}
        onCreateCollection={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border flex items-center justify-between px-8 py-5 shrink-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.04em]">Settings</h1>
          {session?.dbUser && <UserNav user={session.dbUser} />}
        </header>

        <div className="flex-1 overflow-y-auto p-6 max-w-2xl space-y-6">
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
                  <div
                    key={tag.id}
                    className="flex items-center gap-3 py-2"
                  >
                    {editingTag === tag.id ? (
                      <>
                        <div className="flex gap-1">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              className={`w-5 h-5 rounded-full ${editTagColor === c ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
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
                        <Button
                          size="sm"
                          onClick={() => handleUpdateTag(tag.id)}
                        >
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
              <a
                href="/api/export?format=json"
                download
                className="inline-flex items-center justify-center h-8 gap-1.5 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                Export as JSON
              </a>
              <a
                href="/api/export?format=csv"
                download
                className="inline-flex items-center justify-center h-8 gap-1.5 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                Export as CSV
              </a>
            </div>
          </Card>

          <Separator />

          <Card className="p-5 border-destructive/30">
            <h2 className="font-semibold mb-4 text-destructive">
              Danger Zone
            </h2>
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
    </div>
  );
}
