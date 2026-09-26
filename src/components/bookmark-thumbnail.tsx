"use client";

import { useState } from "react";
import Image from "next/image";

import {
  bookmarkThumbnailPlan,
  type ThumbnailBookmark,
} from "@/lib/bookmark-preview";
import { cn } from "@/lib/utils";

export function BookmarkThumbnail({
  bookmark,
  alt,
  sizes,
  priority = false,
  className,
  fallback = null,
}: {
  bookmark: ThumbnailBookmark;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const plan = bookmarkThumbnailPlan(bookmark);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!plan || failedSrc === plan.src) return fallback;

  if (plan.optimized) {
    return (
      <Image
        src={plan.src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", className)}
        onError={() => setFailedSrc(plan.src)}
      />
    );
  }

  return (
    // Card images from other sites are proxied same-origin. next/image would
    // request this route without the session cookie.
    <img
      src={plan.src}
      alt={alt}
      className={cn("size-full object-cover", className)}
      onError={() => setFailedSrc(plan.src)}
    />
  );
}
