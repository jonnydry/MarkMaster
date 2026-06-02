"use client";

import dynamic from "next/dynamic";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
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
  className?: string;
}

export function KeyboardShortcutsHelpButton({
  open,
  onOpenChange,
  groups,
  description,
  className,
}: KeyboardShortcutsHelpButtonProps) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={cn("border-hairline-soft bg-transparent", className)}
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
