"use client";

import { useState, useMemo, useCallback, type ElementType } from "react";
import { Folder, X, CheckCircle2, Tag as TagIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LibrarySearchPicker } from "@/components/library-search-picker";
import { buttonVariants } from "@/components/ui/button";
import { highlightSegmentActiveClass, highlightIdleClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import type { TagWithCount, CollectionWithCount } from "@/types";
import type { OrbitReviewDecision } from "@/lib/orbit-review";
import { splitTagNames } from "@/lib/orbit-review";

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

export function getDecisionLabel(decision: OrbitReviewDecision): string {
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

export function OrbitReviewTagField({
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

  const tagPickerItems = useMemo(
    () =>
      existingTags.map((tag) => {
        const taken = parsed.some(
          (entry) => draftTagKey(entry) === draftTagKey(tag.name)
        );
        return {
          id: tag.id,
          searchText: tag.name,
          disabled: taken || atTagCap,
          label: (
            <>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
                aria-hidden
              />
              {tag.name}
            </>
          ),
          onSelect: () => {
            onTagNamesChange(addTagToDraftString(tagNames, tag.name));
            setLibraryOpen(false);
          },
        };
      }),
    [atTagCap, existingTags, onTagNamesChange, parsed, tagNames]
  );

  return (
    <div className="space-y-2">
      <div className="flex min-h-8 flex-wrap gap-1.5">
        {parsed.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">No tags yet</span>
        ) : (
          parsed.map((label, idx) => (
            <span
              key={`${label}-${idx}`}
              className="inline-flex items-center gap-1 surface-inset-strong py-0.5 pl-2 pr-1 text-xs text-foreground"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tagColorForDisplay(label) }}
                aria-hidden
              />
              {label}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
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
              "border-hairline-soft bg-surface-2 text-foreground hover:bg-accent-soft"
            )}
          >
            From library
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 border border-hairline-strong bg-popover p-0 text-popover-foreground shadow-2xl"
          >
            {libraryOpen ? (
              <LibrarySearchPicker
              placeholder="Search tags…"
              emptyLabel="No matching tags."
              groupHeading="Your library"
              items={tagPickerItems}
              />
            ) : null}
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
          className="min-w-0 flex-1 border-hairline-soft bg-surface-1 text-foreground placeholder:text-muted-foreground/60"
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

export function OrbitReviewCollectionField({
  collectionName,
  collectionDescription,
  included,
  namePlaceholder,
  existingCollections,
  onCollectionNameChange,
  onCollectionDescriptionChange,
}: OrbitReviewCollectionFieldProps) {
  const [pickOpen, setPickOpen] = useState(false);

  const collectionPickerItems = useMemo(
    () =>
      existingCollections.map((collection) => ({
        id: collection.id,
        searchText: `${collection.name} ${collection.description ?? ""}`,
        label: (
          <>
            <Folder className="size-3.5 text-primary/80" />
            {collection.name}
          </>
        ),
        onSelect: () => {
          onCollectionNameChange(collection.name);
          onCollectionDescriptionChange(collection.description ?? "");
          setPickOpen(false);
        },
      })),
    [
      existingCollections,
      onCollectionDescriptionChange,
      onCollectionNameChange,
    ]
  );

  const collectionPickerFooter = useMemo(
    () => [
      {
        id: "__clear__orbit_collection__",
        searchText: "clear collection move",
        label: "Clear collection move",
        className: "text-primary",
        onSelect: () => {
          onCollectionNameChange("");
          onCollectionDescriptionChange("");
          setPickOpen(false);
        },
      },
    ],
    [onCollectionDescriptionChange, onCollectionNameChange]
  );

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
          className="min-w-0 flex-1 border-hairline-soft bg-surface-1 text-foreground placeholder:text-muted-foreground/60"
        />
        <Popover open={pickOpen} onOpenChange={setPickOpen}>
          <PopoverTrigger
            disabled={!included}
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-9 shrink-0 border-hairline-soft bg-surface-2 px-2.5 text-foreground hover:bg-accent-soft"
            )}
          >
            Pick
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 border border-hairline-strong bg-popover p-0 text-popover-foreground shadow-2xl"
          >
            {pickOpen ? (
              <LibrarySearchPicker
              placeholder="Search collections…"
              emptyLabel="No matching collections."
              groupHeading="Your library"
              items={collectionPickerItems}
              footerItems={collectionPickerFooter}
              />
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-2xs leading-snug text-muted-foreground">
        Pick an existing folder or type a new name in the field.
      </p>
      <Textarea
        value={collectionDescription}
        onChange={(event) =>
          onCollectionDescriptionChange(event.target.value)
        }
        disabled={!included || !collectionName.trim()}
        placeholder="Optional description for new collection moves"
        className="min-h-14 border-hairline-soft bg-surface-1 text-foreground placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

export function OrbitReviewDecisionControl({
  value,
  onChange,
}: {
  value: OrbitReviewDecision;
  onChange: (decision: OrbitReviewDecision) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 surface-inset-strong p-1 sm:inline-grid sm:grid-cols-4"
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
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium",
              active ? highlightSegmentActiveClass : highlightIdleClass
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
