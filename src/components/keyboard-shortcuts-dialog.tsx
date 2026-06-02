"use client";

import { Keyboard } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DASHBOARD_SHORTCUT_GROUPS,
  formatShortcutKey,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups?: readonly KeyboardShortcutGroup[];
  description?: string;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  groups = DASHBOARD_SHORTCUT_GROUPS,
  description = "Navigation and quick actions for this view.",
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border border-hairline-strong bg-surface-1/95 p-0 shadow-[0_24px_90px_-48px_rgba(0,0,0,0.9)]">
        <DialogHeader className="border-b border-hairline-soft px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
              <Keyboard className="size-4" aria-hidden />
            </span>
            <div>
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 px-4 pb-4">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {group.title}
              </h3>
              <div className="overflow-hidden rounded-sm border border-hairline-soft">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={shortcut.label}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                      index > 0 && "border-t border-hairline-soft"
                    )}
                  >
                    <span className="text-foreground">{shortcut.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-6 rounded-sm border border-hairline-strong bg-background/60 px-1.5 py-0.5 text-center text-[11px] font-semibold text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]"
                        >
                          {formatShortcutKey(key)}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
