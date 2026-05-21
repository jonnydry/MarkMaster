"use client";

import { useFontMode, useOrbitalTheme } from "@/components/providers";
import {
  getTypographyClasses,
  resolveMonoNative,
  type TypographyClasses,
} from "@/lib/typography";

export function useTypography(): TypographyClasses {
  const { fontMode } = useFontMode();
  const { isOrbital } = useOrbitalTheme();
  const monoNative = resolveMonoNative({ fontMode, isOrbital });
  return getTypographyClasses(monoNative);
}
