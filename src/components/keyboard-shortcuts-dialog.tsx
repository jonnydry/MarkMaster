"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  DASHBOARD_SHORTCUT_GROUPS,
  formatShortcutKey,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { appOverlayDialogSmClassName } from "@/lib/app-layout";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";

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
  const t = useTypography();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={appOverlayDialogSmClassName}>
        <DialogHeader className="border-b border-hairline-soft px-4 py-4">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-4 pb-4">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className={cn(t.label, "mb-2")}>
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
                        <Kbd key={key}>
                          {formatShortcutKey(key)}
                        </Kbd>
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
