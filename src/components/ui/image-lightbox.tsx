"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const labelId = useId();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-sm border border-white/20 bg-black/50 text-white hover:bg-white/10 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
        aria-label="Close full resolution image"
      >
        <X className="size-5" />
      </button>
      <img
        id={labelId}
        src={src}
        alt={alt}
        className={cn(
          "block h-auto w-auto max-w-full object-contain",
          "max-h-[min(92dvh,calc(100dvh-4rem))]"
        )}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
