import { Clock, Folder } from "lucide-react";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import { TagDot } from "@/components/tag-dot";
import type { OrbitGraphNode } from "@/types";

export interface OrbitMapHoverCardProps {
  node: OrbitGraphNode;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

function hoverCopy(node: OrbitGraphNode) {
  switch (node.kind) {
    case "bookmark":
      return {
        title: `@${node.authorUsername}`,
        body: node.title,
        meta: node.recent ? "Recent" : null,
      };
    case "tag":
      return {
        title: node.name,
        body: `${node.count} bookmark${node.count === 1 ? "" : "s"}`,
        meta: "Tag",
        color: node.color,
      };
    case "collection":
      return {
        title: node.name,
        body: `${node.count} bookmark${node.count === 1 ? "" : "s"}`,
        meta: node.variant === "x_folder" ? "X folder" : "Collection",
      };
    case "core":
      return {
        title: "Orbit index",
        body: `${node.looseBookmarks} loose · ${node.totalBookmarks} total`,
        meta: "Core",
      };
    case "overflow":
      return {
        title: `+${node.remaining} more`,
        body: "Hidden by the map cap",
        meta: "Overflow",
      };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

export function OrbitMapHoverCard({
  node,
  x,
  y,
  containerWidth,
  containerHeight,
}: OrbitMapHoverCardProps) {
  const copy = hoverCopy(node);
  const maxLeft = Math.max(8, containerWidth - 272);
  const maxTop = Math.max(8, containerHeight - 140);
  const preferredLeft = x + 14;
  const sideAwareLeft = preferredLeft > maxLeft ? x - 278 : preferredLeft;

  return (
    <div
      data-orbit-hover-card
      className={cn(
        orbitMapFloatingShellClass(),
        "pointer-events-none absolute z-20 w-64 p-3 opacity-95 transition-[opacity,transform] duration-150 ease-out will-change-transform"
      )}
      style={{
        left: Math.min(Math.max(sideAwareLeft, 8), maxLeft),
        top: Math.min(Math.max(y + 14, 8), maxTop),
      }}
    >
      <div className="flex items-center gap-2">
        {node.kind === "tag" ? (
          <TagDot name={node.name} color={node.color} size={8} />
        ) : node.kind === "collection" ? (
          <Folder className="size-3.5 shrink-0 text-primary" aria-hidden />
        ) : (
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              node.kind === "bookmark" && node.affiliated
                ? "bg-muted-foreground/45"
                : "bg-primary"
            )}
          />
        )}
        <span className="truncate text-xs font-semibold text-foreground">
          {copy.title}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
      {copy.meta ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-primary/80">
          {copy.meta === "Recent" ? <Clock className="size-3" aria-hidden /> : null}
          {copy.meta}
        </span>
      ) : null}
    </div>
  );
}
