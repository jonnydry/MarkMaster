import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

type MarkMasterLogoProps = {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export function MarkMasterLogo({
  className,
  width = 28,
  height = 28,
  priority = false,
}: MarkMasterLogoProps) {
  return (
    <Image
      src={logo}
      alt="MarkMaster"
      width={width}
      height={height}
      className={cn("block object-contain", className)}
      priority={priority}
    />
  );
}
