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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { buttonVariants } from "@/components/ui/button";
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

export function OrbitReviewDecisionControl({
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
