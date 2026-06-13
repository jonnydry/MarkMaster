"use client";

import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar-dynamic";
import { appFixedViewportClassName } from "@/lib/app-layout";
import { cn } from "@/lib/utils";
import type { TagWithCount, CollectionWithCount } from "@/types";

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

interface MobileSidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
  onSyncComplete?: () => void;
  onSyncStateChange?: (syncing: boolean) => void;
  lastSyncAt?: Date | null;
  totalBookmarks?: number;
}

export function MobileSidebar(props: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panelRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="md:hidden size-10"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div
        className={cn(
          appFixedViewportClassName,
          "fixed inset-x-0 top-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        className={cn(
          appFixedViewportClassName,
          "fixed left-0 top-0 z-50 w-64 border-r border-sidebar-border/70 bg-sidebar/95 shadow-xl backdrop-blur-xl transition-transform duration-300 ease-out md:hidden dark:bg-sidebar/80",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar navigation"
      >
        <div className="absolute right-3 top-3 z-10">
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex h-full min-h-0 flex-col overflow-hidden pt-10">
          <Sidebar {...props} forceExpanded />
        </div>
      </div>
    </>
  );
}
