"use client";

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
import { cn } from "@/lib/utils";

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
      <DialogContent className={cn(appOverlayDialogSmClassName, "p-4")}>
        <DialogHeader>
          <DialogTitle>
            Organize {bookmarkCount} bookmark{bookmarkCount === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            A focused Orbit review with suggestions you can accept, edit, or keep.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-hairline-soft border-y border-hairline-soft text-sm">
          <SprintDetail
            title={`About ${estimatedMinutes} minutes`}
            description={`${bookmarkCount} focused items${
              resurfacedCount > 0
                ? `, including ${resurfacedCount} worth revisiting`
                : ""
            }.`}
          />
          <SprintDetail
            title="You stay in control"
            description="X access stays read-only, and nothing changes until you approve it."
          />
        </dl>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button type="button" onClick={onStart}>
            Start review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SprintDetail({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="py-2.5">
      <dt className="font-medium text-foreground">{title}</dt>
      <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</dd>
    </div>
  );
}
