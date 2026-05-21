"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";

type Theme = "dark" | "light";
type FontMode = "default" | "mono";

const THEME_STORAGE_KEY = "markmaster-theme";
const THEME_CHANGE_EVENT = "markmaster-theme-change";
const FONT_MODE_STORAGE_KEY = "markmaster-font-mode";
const FONT_MODE_CHANGE_EVENT = "markmaster-font-mode-change";
const ORBITAL_STORAGE_KEY = "markmaster-orbital";
const ORBITAL_CHANGE_EVENT = "markmaster-orbital-change";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getServerTheme(): Theme {
  return "dark";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return getServerTheme();

  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return getServerTheme();
  }
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(THEME_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(THEME_CHANGE_EVENT, handleChange);
  };
}

function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage failures and still update the current document
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/* Font Mode (Monospace UI toggle) — follows exact same persisted + sync pattern as Theme for seamlessness */
const FontModeContext = createContext<{
  fontMode: FontMode;
  toggleFontMode: () => void;
}>({
  fontMode: "default",
  toggleFontMode: () => {},
});

export function useFontMode() {
  return useContext(FontModeContext);
}

function getServerFontMode(): FontMode {
  return "default";
}

function readStoredFontMode(): FontMode {
  if (typeof window === "undefined") return getServerFontMode();
  try {
    return localStorage.getItem(FONT_MODE_STORAGE_KEY) === "mono" ? "mono" : "default";
  } catch {
    return getServerFontMode();
  }
}

function subscribeFontMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(FONT_MODE_CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(FONT_MODE_CHANGE_EVENT, handleChange);
  };
}

function writeFontMode(mode: FontMode) {
  try {
    localStorage.setItem(FONT_MODE_STORAGE_KEY, mode);
  } catch {}
  document.documentElement.setAttribute("data-font-mode", mode);
  window.dispatchEvent(new Event(FONT_MODE_CHANGE_EVENT));
}

function FontModeProvider({ children }: { children: React.ReactNode }) {
  const fontMode = useSyncExternalStore(subscribeFontMode, readStoredFontMode, getServerFontMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-font-mode", fontMode);
  }, [fontMode]);

  const toggleFontMode = useCallback(() => {
    writeFontMode(fontMode === "default" ? "mono" : "default");
  }, [fontMode]);

  const value = useMemo(() => ({ fontMode, toggleFontMode }), [fontMode, toggleFontMode]);

  return (
    <FontModeContext.Provider value={value}>
      {children}
    </FontModeContext.Provider>
  );
}

/* Orbital Theme (Futuristic Minimalism) — opt-in parallel layer, follows the same robust persisted + no-FOUC pattern */
const OrbitalContext = createContext<{
  isOrbital: boolean;
  toggleOrbital: () => void;
}>({
  isOrbital: false,
  toggleOrbital: () => {},
});

export function useOrbitalTheme() {
  return useContext(OrbitalContext);
}

function getServerOrbital(): boolean {
  return false;
}

function readStoredOrbital(): boolean {
  if (typeof window === "undefined") return getServerOrbital();
  try {
    return localStorage.getItem(ORBITAL_STORAGE_KEY) === "true";
  } catch {
    return getServerOrbital();
  }
}

function subscribeOrbital(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(ORBITAL_CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(ORBITAL_CHANGE_EVENT, handleChange);
  };
}

function writeOrbital(active: boolean) {
  try {
    localStorage.setItem(ORBITAL_STORAGE_KEY, active ? "true" : "false");
  } catch {}
  const root = document.documentElement;
  if (active) {
    root.setAttribute("data-theme", "orbital");
    root.classList.add("theme-orbital");
  } else {
    root.removeAttribute("data-theme");
    root.classList.remove("theme-orbital");
  }
  window.dispatchEvent(new Event(ORBITAL_CHANGE_EVENT));
}

function OrbitalThemeProvider({ children }: { children: React.ReactNode }) {
  const isOrbital = useSyncExternalStore(subscribeOrbital, readStoredOrbital, getServerOrbital);

  useEffect(() => {
    const root = document.documentElement;
    if (isOrbital) {
      root.setAttribute("data-theme", "orbital");
      root.classList.add("theme-orbital");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("theme-orbital");
    }
  }, [isOrbital]);

  const toggleOrbital = useCallback(() => {
    writeOrbital(!isOrbital);
  }, [isOrbital]);

  const value = useMemo(() => ({ isOrbital, toggleOrbital }), [isOrbital, toggleOrbital]);

  return (
    <OrbitalContext.Provider value={value}>
      {children}
    </OrbitalContext.Provider>
  );
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, getServerTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    writeTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
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
      <ThemeProvider>
        <FontModeProvider>
          <OrbitalThemeProvider>{children}</OrbitalThemeProvider>
        </FontModeProvider>
      </ThemeProvider>
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
