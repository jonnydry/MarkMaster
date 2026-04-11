"use client";

import { useState } from "react";
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
}

export function MobileSidebar(props: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8"
        onClick={() => setOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border/70 bg-sidebar/75 shadow-lg backdrop-blur-xl backdrop-saturate-150 md:hidden dark:bg-sidebar/50">
            <div className="absolute right-3 top-3 z-10">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="h-full pt-12">
              <Sidebar {...props} forceExpanded />
            </div>
          </div>
        </>
      )}
    </>
  );
}
