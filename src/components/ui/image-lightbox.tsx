"use client";

import { X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  appOverlayDialogLightboxClassName,
  appOverlayLightboxMediaClassName,
} from "@/lib/app-layout";
import { cn } from "@/lib/utils";

export interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Full-resolution media viewer built on the shared base-ui Dialog so focus
 * trap/restore, Escape, and click-outside dismissal come from the primitive.
 * The near-black backdrop over media is a sanctioned literal-alpha exception.
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/90 dark:bg-black/90 supports-backdrop-filter:backdrop-blur-none"
        className={appOverlayDialogLightboxClassName}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogClose
          aria-label="Close full resolution image"
          className="fixed top-4 right-4 flex size-9 items-center justify-center rounded-sm border border-white/20 bg-black/50 text-white hover:bg-white/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
        >
          <X className="size-5" />
        </DialogClose>
        <img
          src={src}
          alt={alt}
          className={cn(
            "block h-auto w-auto object-contain",
            appOverlayLightboxMediaClassName
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
