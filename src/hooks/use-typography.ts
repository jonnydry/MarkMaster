"use client";

import { useFontMode } from "@/components/providers";
import {
  getTypographyClasses,
  resolveMonoNative,
  type TypographyClasses,
} from "@/lib/typography";

export function useTypography(): TypographyClasses {
  const { fontMode } = useFontMode();
  const monoNative = resolveMonoNative({ fontMode });
  return getTypographyClasses(monoNative);
}
