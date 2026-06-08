"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { TagWithCount } from "@/types";

const CollectionsDiscoveryPanel = dynamic(
  () =>
    import("./collections-discovery-panel").then(
      (m) => m.CollectionsDiscoveryPanel
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-sm border border-hairline-soft bg-surface-1/45" />
    ),
  }
);

type LazyCollectionsDiscoverySlotProps = {
  tags: TagWithCount[];
};

export function LazyCollectionsDiscoverySlot({
  tags,
}: LazyCollectionsDiscoverySlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeout = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? (
        <CollectionsDiscoveryPanel tags={tags} />
      ) : (
        <div className="h-44 rounded-sm border border-hairline-soft bg-surface-1/45" />
      )}
    </div>
  );
}
