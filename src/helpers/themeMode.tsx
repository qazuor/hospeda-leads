import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "auto";
const THEME_STORAGE_KEY="hospeda-theme-mode";

function readStoredThemeMode():ThemeMode|null{
  if(typeof window==="undefined")return null;
  const value=window.localStorage.getItem(THEME_STORAGE_KEY);
  return value==="light"||value==="dark"||value==="auto"?value:null;
}

function persistThemeMode(mode:ThemeMode){
  if(typeof window!=="undefined")window.localStorage.setItem(THEME_STORAGE_KEY,mode);
}

// Event mechanism to sync standalone functions with React Context
type ThemeChangeListener = (mode: ThemeMode) => void;
const listeners = new Set<ThemeChangeListener>();

function notifyThemeChange() {
  const mode = getCurrentThemeMode();
  listeners.forEach((listener) => listener(mode));
}

function subscribeToThemeChange(listener: ThemeChangeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateTheme(darkPreferred: boolean): void {
  if (darkPreferred) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}

let currentMediaQuery: MediaQueryList | null = null;

/**
 * Switch to dark mode by adding the "dark" class to document.body.
 */
export function switchToDarkMode(): void {
  // Clear any auto mode listener if present.
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
    currentMediaQuery = null;
  }
  document.body.classList.add("dark");
  persistThemeMode("dark");
  notifyThemeChange();
}

/**
 * Switch to light mode by removing the "dark" class from document.body.
 */
export function switchToLightMode(): void {
  // Clear any auto mode listener if present.
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
    currentMediaQuery = null;
  }
  document.body.classList.remove("dark");
  persistThemeMode("light");
  notifyThemeChange();
}

/**
 * Switch to auto mode. This function immediately applies the user's color scheme preference
 * and listens for system preference changes to update the theme automatically.
 * It uses the onchange property instead of addEventListener to avoid TypeScript issues.
 */
export function switchToAutoMode(): void {
  if (currentMediaQuery) {
    currentMediaQuery.onchange = null;
  }
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.onchange = (e: MediaQueryListEvent) => {
    updateTheme(e.matches);
  };
  currentMediaQuery = mediaQuery;
  updateTheme(mediaQuery.matches);
  persistThemeMode("auto");
  notifyThemeChange();
}

/**
 * Returns the current theme mode:
 * - "auto" if auto mode is enabled,
 * - "dark" if the document body has the "dark" class,
 * - "light" otherwise.
 */
export function getCurrentThemeMode(): ThemeMode {
  const stored=readStoredThemeMode();
  if(stored)return stored;
  if (currentMediaQuery) {
    return "auto";
  }
  return document.body.classList.contains("dark") ? "dark" : "light";
}

// -- React Context & Provider --

interface ThemeModeContextValue {
  mode: ThemeMode;
  switchToDarkMode: () => void;
  switchToLightMode: () => void;
  switchToAutoMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode()??"light");

  useEffect(() => {
    const initial=readStoredThemeMode()??"light";
    if(initial==="dark")switchToDarkMode();
    else if(initial==="auto")switchToAutoMode();
    else switchToLightMode();
    // Subscribe to changes triggered by standalone functions
    const unsubscribe = subscribeToThemeChange((newMode) => {
      setMode(newMode);
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      mode,
      switchToDarkMode,
      switchToLightMode,
      switchToAutoMode,
    }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return context;
}
