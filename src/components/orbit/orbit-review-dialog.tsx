"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Folder,
  Loader2,
  Tag as TagIcon,
  X,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  splitTagNames,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitApplyResult,
  OrbitScanPlan,
  OrbitScanResponsePayload,
  TagWithCount,
} from "@/types";

interface OrbitReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: OrbitScanResponsePayload | null;
  bookmarks: BookmarkWithRelations[];
  dismissedBookmarkIds: Set<string>;
  existingTags: TagWithCount[];
  existingCollections: CollectionWithCount[];
  applying: boolean;
  focusBookmarkId: string | null;
  reviewSessionId: number;
  onApply: (
    reviewedPlan: OrbitScanPlan,
    opts: { createCollections: boolean }
  ) => Promise<OrbitApplyResult | null>;
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

function draftTagKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function addTagToDraftString(current: string, rawName: string): string {
  const trimmed = rawName.replace(/\s+/g, " ").trim();
  if (!trimmed) return current;
  const nextRaw = current.trim() ? `${current}, ${trimmed}` : trimmed;
  return splitTagNames(nextRaw).join(", ");
}

function removeTagAtFromDraftString(current: string, index: number): string {
  const parsed = splitTagNames(current);
  if (index < 0 || index >= parsed.length) return current;
  parsed.splice(index, 1);
  return parsed.join(", ");
}

interface OrbitReviewTagFieldProps {
  tagNames: string;
  included: boolean;
  existingTags: TagWithCount[];
  onTagNamesChange: (next: string) => void;
}

function OrbitReviewTagField({
  tagNames,
  included,
  existingTags,
  onTagNamesChange,
}: OrbitReviewTagFieldProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  const parsed = useMemo(() => splitTagNames(tagNames), [tagNames]);
  const atTagCap = parsed.length >= 3;

  const tagColorForDisplay = useCallback(
    (label: string) => {
      const key = draftTagKey(label);
      return (
        existingTags.find((t) => draftTagKey(t.name) === key)?.color ?? "#94a3b8"
      );
    },
    [existingTags]
  );

  const commitCustom = useCallback(() => {
    if (atTagCap || !included) return;
    const next = addTagToDraftString(tagNames, customDraft);
    onTagNamesChange(next);
    setCustomDraft("");
  }, [atTagCap, customDraft, included, onTagNamesChange, tagNames]);

  return (
    <div className="space-y-2">
      <div className="flex min-h-8 flex-wrap gap-1.5">
        {parsed.length === 0 ? (
          <span className="text-xs text-white/35">No tags yet</span>
        ) : (
          parsed.map((label, idx) => (
            <span
              key={`${label}-${idx}`}
              className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/5 py-0.5 pl-2 pr-1 text-[11px] text-white/85"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tagColorForDisplay(label) }}
                aria-hidden
              />
              {label}
              <button
                type="button"
                className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label={`Remove ${label}`}
                disabled={!included}
                onClick={() =>
                  onTagNamesChange(removeTagAtFromDraftString(tagNames, idx))
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
          <PopoverTrigger
            disabled={!included || atTagCap}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/18 bg-white/[0.06] text-white hover:bg-white/10"
            )}
          >
            From library
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 border border-white/15 bg-slate-950 p-0 text-white shadow-2xl"
          >
            <Command className="relative max-h-80 rounded-lg border-0 bg-slate-950 text-white [&_[cmdk-input-wrapper]]:border-white/10">
              <CommandInput
                placeholder="Search tags…"
                className="text-white placeholder:text-white/35"
              />
              <CommandList>
                <CommandEmpty className="text-white/50">
                  No matching tags.
                </CommandEmpty>
                <CommandGroup heading="Your library">
                  {existingTags.map((tag) => {
                    const taken = parsed.some(
                      (p) => draftTagKey(p) === draftTagKey(tag.name)
                    );
                    return (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        disabled={taken || atTagCap}
                        className="text-white data-[selected=true]:bg-white/10"
                        onSelect={() => {
                          onTagNamesChange(
                            addTagToDraftString(tagNames, tag.name)
                          );
                          setLibraryOpen(false);
                        }}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden
                        />
                        {tag.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          value={customDraft}
          onChange={(event) => setCustomDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCustom();
            }
          }}
          disabled={!included || atTagCap}
          placeholder={
            atTagCap ? "Max 3 tags" : "New tag, press Enter"
          }
          className="min-w-0 flex-1 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
        />
      </div>
    </div>
  );
}

interface OrbitReviewCollectionFieldProps {
  collectionName: string;
  collectionDescription: string;
  included: boolean;
  namePlaceholder: string;
  existingCollections: CollectionWithCount[];
  onCollectionNameChange: (name: string) => void;
  onCollectionDescriptionChange: (description: string) => void;
}

function OrbitReviewCollectionField({
  collectionName,
  collectionDescription,
  included,
  namePlaceholder,
  existingCollections,
  onCollectionNameChange,
  onCollectionDescriptionChange,
}: OrbitReviewCollectionFieldProps) {
  const [pickOpen, setPickOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={collectionName}
          onChange={(event) =>
            onCollectionNameChange(event.target.value)
          }
          disabled={!included}
          placeholder={namePlaceholder}
          className="min-w-0 flex-1 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
        />
        <Popover open={pickOpen} onOpenChange={setPickOpen}>
          <PopoverTrigger
            disabled={!included}
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-9 shrink-0 border-white/18 bg-white/[0.06] px-2.5 text-white hover:bg-white/10"
            )}
          >
            Pick
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 border border-white/15 bg-slate-950 p-0 text-white shadow-2xl"
          >
            <Command className="relative max-h-80 rounded-lg border-0 bg-slate-950 text-white">
              <CommandInput
                placeholder="Search collections…"
                className="text-white placeholder:text-white/35"
              />
              <CommandList>
                <CommandEmpty className="text-white/50">
                  No matching collections.
                </CommandEmpty>
                <CommandGroup heading="Your library">
                  {existingCollections.map((collection) => (
                    <CommandItem
                      key={collection.id}
                      value={`${collection.name} ${collection.description ?? ""}`}
                      className="text-white data-[selected=true]:bg-white/10"
                      onSelect={() => {
                        onCollectionNameChange(collection.name);
                        onCollectionDescriptionChange(
                          collection.description ?? ""
                        );
                        setPickOpen(false);
                      }}
                    >
                      <Folder className="size-3.5 text-sky-200/90" />
                      {collection.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup>
                  <CommandItem
                    value="__clear__orbit_collection__"
                    className="text-amber-200/90 data-[selected=true]:bg-white/10"
                    onSelect={() => {
                      onCollectionNameChange("");
                      onCollectionDescriptionChange("");
                      setPickOpen(false);
                    }}
                  >
                    Clear collection move
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-[10px] leading-snug text-white/45">
        Pick an existing folder or type a new name in the field.
      </p>
      <Textarea
        value={collectionDescription}
        onChange={(event) =>
          onCollectionDescriptionChange(event.target.value)
        }
        disabled={!included || !collectionName.trim()}
        placeholder="Optional description for new collection moves"
        className="min-h-14 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
      />
    </div>
  );
}

function getPreviewText(bookmark: BookmarkWithRelations | null): string {
  if (!bookmark) return "Bookmark is outside the current page.";
  return bookmark.tweetText.replace(/\s+/g, " ").trim();
}

export function OrbitReviewDialog({
  open,
  onOpenChange,
  plan,
  bookmarks,
  dismissedBookmarkIds,
  existingTags,
  existingCollections,
  applying,
  focusBookmarkId,
  reviewSessionId,
  onApply,
}: OrbitReviewDialogProps) {
  const [draftState, setDraftState] = useState<{
    key: string;
    drafts: OrbitReviewSuggestionDraft[];
  }>(() => ({ key: "empty", drafts: [] }));
  const [createCollectionsState, setCreateCollectionsState] = useState<{
    key: string;
    value: boolean;
  }>(() => ({ key: "empty", value: true }));

  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );

  const sourcePlan = useMemo<OrbitScanPlan | null>(() => {
    if (!plan) return null;

    const suggestions = plan.plan.suggestions.filter((suggestion) => {
      if (dismissedBookmarkIds.has(suggestion.bookmarkId)) return false;
      if (focusBookmarkId) return suggestion.bookmarkId === focusBookmarkId;
      return true;
    });

    return {
      overview: plan.plan.overview,
      suggestions,
    };
  }, [dismissedBookmarkIds, focusBookmarkId, plan]);

  const draftKey = useMemo(() => {
    if (!sourcePlan) return "empty";

    return [
      reviewSessionId,
      focusBookmarkId ?? "all",
      sourcePlan.suggestions.map((suggestion) => suggestion.bookmarkId).join("|"),
    ].join(":");
  }, [focusBookmarkId, reviewSessionId, sourcePlan]);

  const drafts = useMemo(() => {
    if (!sourcePlan) return [];
    if (draftState.key === draftKey) return draftState.drafts;
    return createOrbitReviewDraft(sourcePlan);
  }, [draftKey, draftState, sourcePlan]);

  const createCollections =
    createCollectionsState.key === draftKey ? createCollectionsState.value : true;

  const reviewedPlan = useMemo(() => {
    if (!sourcePlan) return null;

    return buildReviewedOrbitPlan({
      sourcePlan,
      drafts,
      existingTags,
      existingCollections,
    });
  }, [drafts, existingCollections, existingTags, sourcePlan]);

  const reviewStats = useMemo(() => {
    const includedDrafts = drafts.filter((draft) => draft.included).length;
    const tagAssignments =
      reviewedPlan?.suggestions.reduce(
        (total, suggestion) => total + suggestion.tags.length,
        0
      ) ?? 0;
    const collectionMoves =
      reviewedPlan?.suggestions.filter((suggestion) => suggestion.collection)
        .length ?? 0;

    return {
      includedDrafts,
      applyableBookmarks: reviewedPlan?.suggestions.length ?? 0,
      tagAssignments,
      collectionMoves,
    };
  }, [drafts, reviewedPlan]);

  const updateDraft = useCallback(
    (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => {
      setDraftState({
        key: draftKey,
        drafts: drafts.map((draft) =>
          draft.bookmarkId === bookmarkId ? { ...draft, ...patch } : draft
        ),
      });
    },
    [draftKey, drafts]
  );

  const handleCreateCollectionsChange = useCallback(
    (value: boolean) => {
      setCreateCollectionsState({ key: draftKey, value });
    },
    [draftKey]
  );

  const handleApply = useCallback(async () => {
    if (!reviewedPlan || reviewedPlan.suggestions.length === 0) return;
    const applied = await onApply(reviewedPlan, { createCollections });
    if (applied) {
      onOpenChange(false);
    }
  }, [createCollections, onApply, onOpenChange, reviewedPlan]);

  const title = focusBookmarkId ? "Review bookmark move" : "Review Orbit pass";
  const canApply = Boolean(reviewedPlan && reviewedPlan.suggestions.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border border-white/10 bg-slate-950 p-0 text-white sm:max-w-5xl">
        <DialogHeader className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 text-sky-100">
              <GrokMark className="size-4" title="Grok" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1 text-white/60">
                Adjust suggested tags and destinations before applying.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <ScrollArea className="max-h-[60vh] min-h-0 pr-3">
            <div className="space-y-3">
              {drafts.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/60">
                  No suggestions are waiting for review.
                </div>
              ) : (
                drafts.map((draft) => {
                  const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                  const preview = getPreviewText(bookmark);
                  const checkboxId = `orbit-review-include-${draft.bookmarkId}`;

                  return (
                    <div
                      key={draft.bookmarkId}
                      className={cn(
                        "rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-sm",
                        !draft.included && "opacity-60"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={checkboxId}
                          checked={draft.included}
                          onCheckedChange={(checked) =>
                            updateDraft(draft.bookmarkId, {
                              included: checked === true,
                            })
                          }
                          aria-label="Include suggestion"
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label
                              htmlFor={checkboxId}
                              className="min-w-0 text-sm text-white"
                            >
                              <span className="truncate">
                                {bookmark
                                  ? `@${bookmark.authorUsername}`
                                  : draft.bookmarkId}
                              </span>
                            </Label>
                            <Badge
                              variant="outline"
                              className="border-white/12 bg-white/5 text-[10px] uppercase tracking-[0.16em] text-white/60"
                            >
                              {draft.included ? "Included" : "Skipped"}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/55">
                            {preview}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 md:items-start">
                        <div className="space-y-1.5">
                          <p className="flex items-center gap-1.5 text-xs text-white/70">
                            <TagIcon className="size-3.5 shrink-0" />
                            Tags
                          </p>
                          <OrbitReviewTagField
                            tagNames={draft.tagNames}
                            included={draft.included}
                            existingTags={existingTags}
                            onTagNamesChange={(next) =>
                              updateDraft(draft.bookmarkId, {
                                tagNames: next,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <p className="flex items-center gap-1.5 text-xs text-white/70">
                            <Folder className="size-3.5 shrink-0" />
                            Collection
                          </p>
                          <OrbitReviewCollectionField
                            collectionName={draft.collectionName}
                            collectionDescription={draft.collectionDescription}
                            included={draft.included}
                            namePlaceholder="No collection move"
                            existingCollections={existingCollections}
                            onCollectionNameChange={(name) =>
                              updateDraft(draft.bookmarkId, {
                                collectionName: name,
                              })
                            }
                            onCollectionDescriptionChange={(description) =>
                              updateDraft(draft.bookmarkId, {
                                collectionDescription: description,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <aside className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p
                className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
                style={MONO_STYLE}
              >
                Review summary
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <SummaryStat label="Included" value={reviewStats.includedDrafts} />
                <SummaryStat
                  label="Applied"
                  value={reviewStats.applyableBookmarks}
                />
                <SummaryStat label="Tags" value={reviewStats.tagAssignments} />
                <SummaryStat
                  label="Moves"
                  value={reviewStats.collectionMoves}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    New collections
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {createCollections ? "Allowed" : "Existing only"}
                  </p>
                </div>
                <Switch
                  checked={createCollections}
                  onCheckedChange={handleCreateCollectionsChange}
                />
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="border-white/10 bg-slate-950/95 px-5 py-4">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            className="gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={handleApply}
            disabled={!canApply || applying}
          >
            {applying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Apply reviewed plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}
