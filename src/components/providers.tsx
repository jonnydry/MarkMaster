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
import { TypographyFontLoader } from "@/components/typography-font-loader";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { toast } from "@/lib/toast";
import {
  type ColorThemeId,
  resolveColorTheme,
} from "@/lib/color-themes";
import {
  DEFAULT_TYPOGRAPHY_PRESET,
  resolveTypographyPreset,
  type TypographyPresetId,
} from "@/lib/typography-presets";

type Theme = "dark" | "light";
type AppearanceSnapshot = {
  theme: Theme;
  typographyPreset: TypographyPresetId;
  colorTheme: ColorThemeId;
};

const THEME_STORAGE_KEY = "markmaster-theme";
const TYPOGRAPHY_PRESET_STORAGE_KEY = "markmaster-typography-preset";
const FONT_MODE_STORAGE_KEY = "markmaster-font-mode";
const COLOR_THEME_STORAGE_KEY = "markmaster-color-theme";
const LEGACY_ORBITAL_STORAGE_KEY = "markmaster-orbital";
const APPEARANCE_CHANGE_EVENT = "markmaster-appearance-change";

const SERVER_APPEARANCE: AppearanceSnapshot = {
  theme: "dark",
  typographyPreset: DEFAULT_TYPOGRAPHY_PRESET,
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
  fontMode: TypographyPresetId;
  typographyPreset: TypographyPresetId;
  setFontMode: (mode: TypographyPresetId) => void;
  setTypographyPreset: (preset: TypographyPresetId) => void;
  toggleFontMode: () => void;
}>({
  fontMode: DEFAULT_TYPOGRAPHY_PRESET,
  typographyPreset: DEFAULT_TYPOGRAPHY_PRESET,
  setFontMode: () => {},
  setTypographyPreset: () => {},
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
    cachedAppearance.typographyPreset === next.typographyPreset &&
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
    const legacyFontMode = localStorage.getItem(FONT_MODE_STORAGE_KEY);
    return memoizeAppearance({
      theme: localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark",
      typographyPreset: resolveTypographyPreset(
        localStorage.getItem(TYPOGRAPHY_PRESET_STORAGE_KEY),
        legacyFontMode
      ),
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

function applyAppearance({
  theme,
  typographyPreset,
  colorTheme,
}: AppearanceSnapshot) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-typography-preset", typographyPreset);
  root.removeAttribute("data-font-mode");

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

function writeTypographyPreset(typographyPreset: TypographyPresetId) {
  try {
    localStorage.setItem(TYPOGRAPHY_PRESET_STORAGE_KEY, typographyPreset);
    localStorage.setItem(
      FONT_MODE_STORAGE_KEY,
      typographyPreset === "mono" ? "mono" : "default"
    );
  } catch {
    // Keep DOM state responsive when storage is unavailable.
  }
  applyAppearance({ ...readAppearance(), typographyPreset });
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

  const setFontMode = useCallback((mode: TypographyPresetId) => {
    writeTypographyPreset(mode);
  }, []);

  const setTypographyPreset = useCallback((preset: TypographyPresetId) => {
    writeTypographyPreset(preset);
  }, []);

  const toggleFontMode = useCallback(() => {
    writeTypographyPreset(
      appearance.typographyPreset === "mono" ? DEFAULT_TYPOGRAPHY_PRESET : "mono"
    );
  }, [appearance.typographyPreset]);

  const setColorTheme = useCallback((colorTheme: ColorThemeId) => {
    writeColorTheme(colorTheme);
  }, []);

  const themeValue = useMemo(
    () => ({ theme: appearance.theme, setTheme, toggleTheme }),
    [appearance.theme, setTheme, toggleTheme]
  );
  const fontModeValue = useMemo(
    () => ({
      fontMode: appearance.typographyPreset,
      typographyPreset: appearance.typographyPreset,
      setFontMode,
      setTypographyPreset,
      toggleFontMode,
    }),
    [
      appearance.typographyPreset,
      setFontMode,
      setTypographyPreset,
      toggleFontMode,
    ]
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

/** Theme/typography only — safe for login and other unauthenticated routes. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppearanceProvider>
      <TypographyFontLoader />
      {children}
    </AppearanceProvider>
  );
}

const OFFLINE_TOAST_ID = "markmaster-offline";

/**
 * Persistent (dismissable) toast while the browser is offline, cleared on
 * reconnect. Renders nothing itself.
 */
function OfflineIndicator() {
  const online = useOnlineStatus();

  useEffect(() => {
    if (online) {
      toast.dismiss(OFFLINE_TOAST_ID);
      return;
    }
    toast.warning("You're offline", {
      id: OFFLINE_TOAST_ID,
      description: "Syncing and saving will fail until the connection returns.",
      duration: Infinity,
      closeButton: true,
    });
  }, [online]);

  return null;
}

/** React Query — scoped to authenticated (main) routes only. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineIndicator />
      {children}
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
