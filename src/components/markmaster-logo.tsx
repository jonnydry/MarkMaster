import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

type MarkMasterLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /** Disable the drop-shadow glow (keeps theme tint) — for watermark scale. */
  glow?: boolean;
};

export function MarkMasterLogo({
  className,
  width = 28,
  height = 28,
  priority = false,
  glow = true,
}: MarkMasterLogoProps) {
  return (
    <Image
      src={logo}
      alt="MarkMaster"
      width={width}
      height={height}
      className={cn(
        glow ? "markmaster-logo" : "markmaster-logo-flat",
        "block object-contain",
        className
      )}
      priority={priority}
    />
  );
}
