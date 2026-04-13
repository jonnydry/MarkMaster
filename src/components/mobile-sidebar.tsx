"use client";

import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import type { TagWithCount, CollectionWithCount } from "@/types";

interface MobileSidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
  onSyncComplete?: () => void;
  lastSyncAt?: Date | null;
  totalBookmarks?: number;
}

export function MobileSidebar(props: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border/70 bg-sidebar/95 shadow-xl backdrop-blur-xl md:hidden dark:bg-sidebar/80 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar navigation"
      >
        <div className="absolute right-3 top-3 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="h-full min-h-0 pt-10 overflow-y-auto overscroll-contain scrollbar-thin">
          <Sidebar {...props} forceExpanded />
        </div>
      </div>
    </>
  );
}