"use client";

import { CheckCircle2, Clock3, Eye, LockKeyhole } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { appOverlayDialogSmClassName } from "@/lib/app-layout";

export function OrganizationSprintDialog({
  open,
  onOpenChange,
  bookmarkCount,
  resurfacedCount,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkCount: number;
  resurfacedCount: number;
  onStart: () => void;
}) {
  const estimatedMinutes = Math.max(2, Math.ceil(bookmarkCount / 3));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={appOverlayDialogSmClassName}>
        <div className="p-4">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <OrbitLogoMark className="size-5" aria-hidden="true" />
              <span className="text-2xs font-semibold uppercase tracking-[0.08em]">
                Organization Sprint
              </span>
            </div>
            <DialogTitle className="text-lg">
              Organize {bookmarkCount} bookmark{bookmarkCount === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              A focused Orbit review with suggestions you can accept, edit, or keep.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-2">
            <SprintDetail
              icon={Clock3}
              title={`About ${estimatedMinutes} minutes`}
              description={`${bookmarkCount} focused items${
                resurfacedCount > 0
                  ? `, including ${resurfacedCount} worth revisiting`
                  : ""
              }.`}
            />
            <SprintDetail
              icon={Eye}
              title="Useful context only"
              description="Grok sees the post, author, and your existing tag and collection vocabulary."
            />
            <SprintDetail
              icon={LockKeyhole}
              title="You stay in control"
              description="X access remains read-only, and nothing changes until you approve it."
            />
          </div>

          <div className="mt-4 flex items-center gap-2 surface-inset-strong px-3 py-2 text-xs text-muted-foreground">
            <GrokMark className="size-3.5 shrink-0" title="Grok" />
            <span>Suggestions may abstain when there is not a confident match.</span>
            <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-success" aria-hidden="true" />
          </div>
        </div>

        <DialogFooter className="m-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button type="button" variant="highlight" onClick={onStart}>
            Start sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SprintDetail({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock3;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 surface-inset p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
