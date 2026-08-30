"use client";

import { useCallback, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button with the destructive variant. */
  destructive?: boolean;
};

type PendingConfirm = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => pending;
const getServerSnapshot = () => null;

/**
 * Themed, promise-based replacement for window.confirm. Resolves true when
 * the user confirms; false on cancel, Escape, or backdrop dismiss. Requires
 * a single <ConfirmDialogHost /> mounted at the app root.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Only one prompt at a time — settle a superseded prompt as cancelled.
    pending?.resolve(false);
    pending = { ...options, resolve };
    emit();
  });
}

function settle(confirmed: boolean) {
  const current = pending;
  if (!current) return;
  pending = null;
  emit();
  current.resolve(confirmed);
}

export function ConfirmDialogHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) settle(false);
  }, []);

  if (!current) return null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          {current.description ? (
            <DialogDescription>{current.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(false)}>
            {current.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={current.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {current.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
