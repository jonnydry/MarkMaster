"use client";

import { Button } from "@/components/ui/button";
import { TagDot } from "@/components/tag-dot";
import { OrbitActivityBanner } from "@/components/orbit/orbit-activity-banner";
import type { OrbitLibraryTagHandle } from "@/hooks/use-orbit-library-tag";

/** Tags shown in the banner before collapsing into "+N more". */
const VOCABULARY_PREVIEW = 8;

/** Progress, controls, and the tag list for a whole-queue auto-tag run. */
export function OrbitLibraryRunBanner({
  libraryTag,
}: {
  libraryTag: OrbitLibraryTagHandle;
}) {
  const { run, failed, paused, progress, detail, starting, stopping } =
    libraryTag;
  if (!run) return null;

  const vocabulary = run.vocabulary ?? [];
  const shown = vocabulary.slice(0, VOCABULARY_PREVIEW);
  const more = vocabulary.length - shown.length;

  const stopButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={stopping}
      onClick={() => void libraryTag.stop()}
    >
      {failed ? "Dismiss" : stopping ? "Stopping…" : "Stop"}
    </Button>
  );

  return (
    <OrbitActivityBanner
      title={
        failed
          ? "Auto-tag stopped"
          : paused
            ? "Auto-tag paused"
            : "Auto-tagging the queue"
      }
      detail={detail}
      // Indeterminate until the tag list is ready and the count means something.
      progress={run.vocabulary ? progress : null}
      paused={paused}
      action={
        paused ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={starting}
              onClick={() => void libraryTag.start()}
            >
              {starting ? "Resuming…" : "Resume"}
            </Button>
            {stopButton}
          </div>
        ) : (
          stopButton
        )
      }
    >
      {shown.length > 0 ? (
        <ul
          aria-label="Tags being applied"
          className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1"
        >
          {shown.map((tag) => (
            <li
              key={tag.name}
              className="inline-flex max-w-[12rem] items-center gap-1.5 text-xs text-muted-foreground"
            >
              <TagDot name={tag.name} color={tag.color} size={8} />
              <span className="truncate">{tag.name}</span>
            </li>
          ))}
          {more > 0 ? (
            <li className="text-xs text-muted-foreground">
              +{more.toLocaleString()} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </OrbitActivityBanner>
  );
}
