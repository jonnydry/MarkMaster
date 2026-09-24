"use client";

import dynamic from "next/dynamic";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import {
  appToolbarControlBoxClassName,
  appToolbarSurfaceClassName,
} from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

const KeyboardShortcutsDialog = dynamic(
  () =>
    import("@/components/keyboard-shortcuts-dialog").then(
      (m) => m.KeyboardShortcutsDialog
    ),
  { ssr: false }
);

interface KeyboardShortcutsHelpButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly KeyboardShortcutGroup[];
  description: string;
  toolbarSize?: "compact" | "default";
  className?: string;
}

export function KeyboardShortcutsHelpButton({
  open,
  onOpenChange,
  groups,
  description,
  toolbarSize = "default",
  className,
}: KeyboardShortcutsHelpButtonProps) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={toolbarSize === "compact" ? "icon" : "icon-lg"}
        className={cn(
          "shrink-0 border-transparent bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
          toolbarSize === "compact" && appToolbarSurfaceClassName,
          toolbarSize === "compact" && appToolbarControlBoxClassName(true),
          className
        )}
        aria-label="Keyboard shortcuts"
        onClick={() => onOpenChange(true)}
      >
        <Keyboard className="size-4" aria-hidden />
      </Button>
      {open ? (
        <KeyboardShortcutsDialog
          open
          onOpenChange={onOpenChange}
          groups={groups}
          description={description}
        />
      ) : null}
    </>
  );
}
