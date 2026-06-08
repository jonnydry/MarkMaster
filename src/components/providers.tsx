"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ColorThemeId,
  resolveColorTheme,
} from "@/lib/color-themes";

type Theme = "dark" | "light";
type FontMode = "default" | "mono";
type AppearanceSnapshot = {
  theme: Theme;
  fontMode: FontMode;
  colorTheme: ColorThemeId;
};

const THEME_STORAGE_KEY = "markmaster-theme";
const FONT_MODE_STORAGE_KEY = "markmaster-font-mode";
const COLOR_THEME_STORAGE_KEY = "markmaster-color-theme";
const LEGACY_ORBITAL_STORAGE_KEY = "markmaster-orbital";
const APPEARANCE_CHANGE_EVENT = "markmaster-appearance-change";

const SERVER_APPEARANCE: AppearanceSnapshot = {
  theme: "dark",
  fontMode: "default",
  colorTheme: "horizon",
};
let cachedAppearance: AppearanceSnapshot = SERVER_APPEARANCE;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

const FontModeContext = createContext<{
  fontMode: FontMode;
  setFontMode: (mode: FontMode) => void;
  toggleFontMode: () => void;
}>({
  fontMode: "default",
  setFontMode: () => {},
  toggleFontMode: () => {},
});

const ColorThemeContext = createContext<{
  colorTheme: ColorThemeId;
  setColorTheme: (colorTheme: ColorThemeId) => void;
}>({
  colorTheme: "horizon",
  setColorTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function useFontMode() {
  return useContext(FontModeContext);
}

export function useColorTheme() {
  return useContext(ColorThemeContext);
}

function memoizeAppearance(next: AppearanceSnapshot) {
  if (
    cachedAppearance.theme === next.theme &&
    cachedAppearance.fontMode === next.fontMode &&
    cachedAppearance.colorTheme === next.colorTheme
  ) {
    return cachedAppearance;
  }

  cachedAppearance = next;
  return cachedAppearance;
}

function readAppearance(): AppearanceSnapshot {
  if (typeof window === "undefined") return SERVER_APPEARANCE;

  try {
    const legacyOrbital = localStorage.getItem(LEGACY_ORBITAL_STORAGE_KEY) === "true";
    return memoizeAppearance({
      theme: localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark",
      fontMode:
        localStorage.getItem(FONT_MODE_STORAGE_KEY) === "mono" ? "mono" : "default",
      colorTheme: resolveColorTheme(
        localStorage.getItem(COLOR_THEME_STORAGE_KEY),
        legacyOrbital
      ),
    });
  } catch {
    return SERVER_APPEARANCE;
  }
}

function subscribeAppearance(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(APPEARANCE_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(APPEARANCE_CHANGE_EVENT, handleChange);
  };
}

function applyAppearance({ theme, fontMode, colorTheme }: AppearanceSnapshot) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-font-mode", fontMode);

  if (colorTheme === "horizon") {
    root.removeAttribute("data-color-theme");
  } else {
    root.setAttribute("data-color-theme", colorTheme);
  }

  root.removeAttribute("data-theme");
  root.classList.remove("theme-orbital");
}

function emitAppearanceChange() {
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT));
}

function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Keep DOM state responsive when storage is unavailable.
  }
  applyAppearance({ ...readAppearance(), theme });
  emitAppearanceChange();
}

function writeFontMode(fontMode: FontMode) {
  try {
    localStorage.setItem(FONT_MODE_STORAGE_KEY, fontMode);
  } catch {
    // Keep DOM state responsive when storage is unavailable.
  }
  applyAppearance({ ...readAppearance(), fontMode });
  emitAppearanceChange();
}

function writeColorTheme(colorTheme: ColorThemeId) {
  try {
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
    localStorage.removeItem(LEGACY_ORBITAL_STORAGE_KEY);
  } catch {
    // Keep DOM state responsive when storage is unavailable.
  }
  applyAppearance({ ...readAppearance(), colorTheme });
  emitAppearanceChange();
}

function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const appearance = useSyncExternalStore(
    subscribeAppearance,
    readAppearance,
    () => SERVER_APPEARANCE
  );

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    writeTheme(appearance.theme === "dark" ? "light" : "dark");
  }, [appearance.theme]);

  const setFontMode = useCallback((mode: FontMode) => {
    writeFontMode(mode);
  }, []);

  const toggleFontMode = useCallback(() => {
    writeFontMode(appearance.fontMode === "default" ? "mono" : "default");
  }, [appearance.fontMode]);

  const setColorTheme = useCallback((colorTheme: ColorThemeId) => {
    writeColorTheme(colorTheme);
  }, []);

  const themeValue = useMemo(
    () => ({ theme: appearance.theme, setTheme, toggleTheme }),
    [appearance.theme, setTheme, toggleTheme]
  );
  const fontModeValue = useMemo(
    () => ({
      fontMode: appearance.fontMode,
      setFontMode,
      toggleFontMode,
    }),
    [appearance.fontMode, setFontMode, toggleFontMode]
  );
  const colorThemeValue = useMemo(
    () => ({
      colorTheme: appearance.colorTheme,
      setColorTheme,
    }),
    [appearance.colorTheme, setColorTheme]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <FontModeContext.Provider value={fontModeValue}>
        <ColorThemeContext.Provider value={colorThemeValue}>
          {children}
        </ColorThemeContext.Provider>
      </FontModeContext.Provider>
    </ThemeContext.Provider>
  );
}

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>{children}</AppearanceProvider>
    </QueryClientProvider>
  );
}

export function AuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider
      session={session ?? null}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  );
}
