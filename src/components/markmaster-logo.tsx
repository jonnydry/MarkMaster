import Image from "next/image";
import { cn } from "@/lib/utils";

type MarkMasterLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /** Disable the drop-shadow glow (keeps theme tint) — for watermark scale. */
  glow?: boolean;
  /** Render as decorative (empty alt) — use when an adjacent wordmark carries the name. */
  decorative?: boolean;
};

export function MarkMasterLogo({
  className,
  width = 28,
  height = 28,
  priority = false,
  glow = true,
  decorative = false,
}: MarkMasterLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={decorative ? "" : "MarkMaster"}
      width={width}
      height={height}
      className={cn(
        glow ? "markmaster-logo" : "markmaster-logo-flat",
        "block object-contain",
        className
      )}
      priority={priority}
      sizes={`${width}px`}
    />
  );
}
