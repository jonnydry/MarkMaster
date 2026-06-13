"use client";

import { useEffect } from "react";

import { fontVariablesForPreset } from "@/lib/app-fonts";
import { useFontMode } from "@/components/providers";

const ALL_LAZY_FONT_VARIABLES = [
  ...fontVariablesForPreset("classic"),
  ...fontVariablesForPreset("editorial"),
];

/** Applies lazy-loaded font CSS variables when non-default typography presets are active. */
export function TypographyFontLoader() {
  const { typographyPreset } = useFontMode();

  useEffect(() => {
    const root = document.documentElement;
    for (const variable of ALL_LAZY_FONT_VARIABLES) {
      root.classList.remove(variable);
    }
    for (const variable of fontVariablesForPreset(typographyPreset)) {
      root.classList.add(variable);
    }
  }, [typographyPreset]);

  return null;
}
