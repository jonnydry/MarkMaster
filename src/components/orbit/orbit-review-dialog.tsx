"use client";

import { useCallback, useMemo, useState, type ElementType } from "react";
import {
  CheckCircle2,
  Folder,
  Loader2,
  Tag as TagIcon,
  X,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { OrbitReviewEditSheet } from "@/components/orbit/orbit-review-edit-sheet";
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
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
  splitTagNames,
  type OrbitReviewDecision,
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
    opts: { createCollections: boolean; keptBookmarkIds: string[] }
  ) => Promise<OrbitApplyResult | null>;
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

const REVIEW_DECISION_OPTIONS: Array<{
  value: OrbitReviewDecision;
  label: string;
  icon: ElementType<{ className?: string }>;
}> = [
  { value: "keep", label: "Keep", icon: OrbitLogoMark },
  { value: "tags", label: "Tags", icon: TagIcon },
  { value: "collection", label: "Collect", icon: Folder },
  { value: "tags_collection", label: "Both", icon: CheckCircle2 },
];

function getDecisionLabel(decision: OrbitReviewDecision): string {
  return (
    REVIEW_DECISION_OPTIONS.find((option) => option.value === decision)?.label ??
    "Manual"
  );
}

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
                    className="text-sky-200/90 data-[selected=true]:bg-white/10"
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

function OrbitReviewDecisionControl({
  value,
  onChange,
}: {
  value: OrbitReviewDecision;
  onChange: (decision: OrbitReviewDecision) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/10 p-1 sm:inline-grid sm:grid-cols-4"
      role="radiogroup"
      aria-label="Review decision"
    >
      {REVIEW_DECISION_OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
              active
                ? "bg-white text-slate-950 shadow-sm"
                : "text-white/60 hover:bg-white/[0.08] hover:text-white"
            )}
            onClick={() => onChange(option)}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
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

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [sheetBookmarkId, setSheetBookmarkId] = useState<string | null>(null);

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
    const keptBookmarks = drafts.filter((draft) => draft.decision === "keep")
      .length;
    const tagAssignments =
      reviewedPlan?.suggestions.reduce(
        (total, suggestion) => total + suggestion.tags.length,
        0
      ) ?? 0;
    const collectionMoves =
      reviewedPlan?.suggestions.filter((suggestion) => suggestion.collection)
        .length ?? 0;

    return {
      applyableBookmarks: reviewedPlan?.suggestions.length ?? 0,
      keptBookmarks,
      tagAssignments,
      collectionMoves,
    };
  }, [drafts, reviewedPlan]);

  const keptBookmarkIds = useMemo(
    () =>
      drafts
        .filter((draft) => draft.decision === "keep")
        .map((draft) => draft.bookmarkId),
    [drafts]
  );

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
    if (
      !reviewedPlan ||
      (reviewedPlan.suggestions.length === 0 && keptBookmarkIds.length === 0)
    ) {
      return;
    }
    const applied = await onApply(reviewedPlan, {
      createCollections,
      keptBookmarkIds,
    });
    if (applied) {
      onOpenChange(false);
    }
  }, [createCollections, keptBookmarkIds, onApply, onOpenChange, reviewedPlan]);

  const title = focusBookmarkId ? "Review bookmark move" : "Review Orbit pass";
  const canApply = Boolean(
    reviewedPlan &&
      (reviewedPlan.suggestions.length > 0 || keptBookmarkIds.length > 0)
  );

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
                Choose what to do with each suggestion, then adjust the tags and
                destinations that will be applied.
              </DialogDescription>
            </div>
          </div>
        {/* Refined Native-First Orbit Review — vertical list of native-style cards + Impact Bar */}
        <div className="min-h-0 overflow-hidden px-4 py-3">
          {/* Global Impact Bar (styled like rail metrics) */}
          {drafts.length > 0 && (
            <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-[11px]">
                  <div><span className="text-white/45">Apply</span> <span className="font-medium tabular-nums">{reviewStats.applyableBookmarks}</span></div>
                  <div><span className="text-white/45">Keep</span> <span className="font-medium tabular-nums">{reviewStats.keptBookmarks}</span></div>
                  <div><span className="text-sky-300/80">+{impact.newTags.length} tags</span></div>
                  <div><span className="text-sky-300/80">+{impact.newCollections.length} cols</span></div>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleBulkApplySuggested} disabled={applying}>
                    <RotateCcw className="mr-1 size-3" /> Restore all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkKeepAll} disabled={applying}>
                    Keep all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkTagOnly} disabled={applying}>
                    Tag all
                  </Button>

                  <div className="ml-2 flex items-center gap-2 border-l border-white/10 pl-3">
                    <span className="text-xs text-white/60">New collections</span>
                    <Switch checked={createCollections} onCheckedChange={handleCreateCollectionsChange} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <ScrollArea className="h-[58vh]">
            <div className="space-y-3 pb-6">
              {drafts.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-white/50">
                  No suggestions are waiting for review.
                </div>
              )}

              {drafts.map((draft) => {
                const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                const preview = getPreviewText(bookmark);
                const original = originalSuggestionById.get(draft.bookmarkId) ?? null;

                const origDecisionLabel = original
                  ? (original.tags.length && original.collection ? "Both" : original.tags.length ? "Tags" : original.collection ? "Collect" : "Keep")
                  : "—";

                const currDecisionLabel = getDecisionLabel(draft.decision);

                const origTagNames = original ? original.tags.map((t) => t.name) : [];
                const currTagNames = splitTagNames(draft.tagNames);

                const origTagSet = new Set(origTagNames);
                const currTagSet = new Set(currTagNames);

                const addedTags = currTagNames.filter((t) => !origTagSet.has(t));
                const removedTags = origTagNames.filter((t) => !currTagSet.has(t));

                const origCol = original?.collection?.name || null;
                const currCol = draft.collectionName.trim() || null;

                const hasChanges = draft.decision !== (original ? (original.tags.length && original.collection ? "tags_collection" : original.tags.length ? "tags" : original.collection ? "collection" : "keep") : "keep")
                  || draft.tagNames !== origTagNames.join(", ")
                  || draft.collectionName !== (origCol || "");

                return (
                  <div
                    key={draft.bookmarkId}
                    className={cn(
                      "group relative rounded-2xl border border-hairline-soft bg-surface-1 shadow-sm transition-all",
                      draft.decision === "keep" && "opacity-75",
                      sheetBookmarkId === draft.bookmarkId && "border-sky-400/50 bg-surface-2/70",
                      "hover:border-white/20 hover:bg-surface-2/50"
                    )}
                  >
                    {/* Header — native to triage card + focus strip */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-white/90">
                          @{bookmark?.authorUsername || draft.bookmarkId}
                        </span>
                        {original && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                              original.confidence === "high" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                              original.confidence === "medium" && "border-sky-400/30 bg-sky-400/10 text-sky-200",
                              original.confidence === "low" && "border-blue-500/30 bg-blue-500/10 text-blue-200"
                            )}
                            title={formatConfidence(original.confidence)}
                          >
                            {confidenceLabel(original.confidence).split(" ")[0]}
                          </span>
                        )}
                      </div>

                      {hasChanges && (
                        <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-300">edited</span>
                      )}
                    </div>

                    {/* Preview */}
                    <div className="px-4 pb-2 text-[13px] leading-snug text-white/80 line-clamp-2">
                      {preview}
                    </div>

                    {/* Grok reasoning — native meta label */}
                    {original?.reasoning && (
                      <div className="px-4 pb-2 text-xs leading-snug text-white/65">
                        {original.reasoning}
                      </div>
                    )}

                    {/* Compact change summary — elegant native treatment */}
                    {hasChanges && (
                      <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {currDecisionLabel !== origDecisionLabel && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-px text-amber-300">
                            Decision changed
                          </span>
                        )}
                        {addedTags.length > 0 && (
                          <span className="rounded bg-emerald-400/15 px-1.5 py-px text-emerald-300">
                            +{addedTags.length} tags
                          </span>
                        )}
                        {removedTags.length > 0 && (
                          <span className="rounded bg-rose-400/15 px-1.5 py-px text-rose-300">
                            −{removedTags.length} tags
                          </span>
                        )}
                        {origCol !== currCol && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-px text-amber-300">
                            Collection changed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action footer — exact triage card treatment for native cohesion */}
                    <div className="relative flex flex-col gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(10,15,29,0.85))] px-4 py-3 rounded-b-2xl">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md border border-white/10 bg-black/20 p-px">
                          <OrbitReviewDecisionControl
                            value={draft.decision}
                            size="default"
                            onChange={(decision) => updateDraft(draft.bookmarkId, { decision, included: decision !== "keep" })}
                          />
                        </div>

                        <div className="ml-auto flex items-center gap-1.5">
                          {hasChanges && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-[10px] text-white/70 hover:text-white"
                              onClick={() => handleResetOne(draft.bookmarkId)}
                              disabled={applying}
                            >
                              <RotateCcw className="size-3" /> Reset
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-7 gap-1 border-white/20 bg-white/5 text-[10px] text-white/80 hover:bg-white/10",
                              sheetBookmarkId === draft.bookmarkId && "border-sky-400/60 bg-sky-400/10 text-sky-200"
                            )}
                            onClick={() => {
                              setSheetBookmarkId(draft.bookmarkId);
                              setIsEditSheetOpen(true);
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </div>

                      {/* Inline editors — refined native treatment inside the action footer */}
                      {draft.decision !== "keep" && (
                        <div className="grid gap-4 pt-2 md:grid-cols-2">
                          <div className="rounded-lg bg-white/[0.02] p-2.5">
                            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                              Tags
                            </div>
                            <OrbitReviewTagField
                              tagNames={draft.tagNames}
                              included={orbitReviewDecisionUsesTags(draft.decision)}
                              existingTags={existingTags}
                              onTagNamesChange={(n) => updateDraft(draft.bookmarkId, { tagNames: n })}
                            />
                          </div>
                          <div className="rounded-lg bg-white/[0.02] p-2.5">
                            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                              Collection
                            </div>
                            <OrbitReviewCollectionField
                              collectionName={draft.collectionName}
                              collectionDescription={draft.collectionDescription}
                              included={orbitReviewDecisionUsesCollection(draft.decision)}
                              namePlaceholder="No collection move"
                              existingCollections={existingCollections}
                              onCollectionNameChange={(n) => updateDraft(draft.bookmarkId, { collectionName: n })}
                              onCollectionDescriptionChange={(d) => updateDraft(draft.bookmarkId, { collectionDescription: d })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right-side rich editing sheet */}
        <OrbitReviewEditSheet
          open={isEditSheetOpen}
          onOpenChange={setIsEditSheetOpen}
          draft={drafts.find((d) => d.bookmarkId === sheetBookmarkId) ?? null}
          original={sheetBookmarkId ? originalSuggestionById.get(sheetBookmarkId) ?? null : null}
          bookmark={sheetBookmarkId ? bookmarkById.get(sheetBookmarkId) ?? null : null}
          existingTags={existingTags}
          existingCollections={existingCollections}
          onDraftChange={(id, patch) => updateDraft(id, patch)}
          onReset={(id) => handleResetOne(id)}
        />

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
            Apply decisions
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
