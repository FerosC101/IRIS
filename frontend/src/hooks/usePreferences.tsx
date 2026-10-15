import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setDateStyle, type DateStyle } from "@/lib/format";

export interface Preferences {
  density: "comfortable" | "compact";
  dateStyle: DateStyle;
  largeText: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
  strongFocus: boolean;
  showAnswerKey: boolean;
}

const DEFAULTS: Preferences = {
  density: "comfortable",
  dateStyle: "readable",
  largeText: false,
  reduceMotion: false,
  underlineLinks: false,
  strongFocus: false,
  showAnswerKey: true,
};
const KEY = "iris.preferences";

function load(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{ prefs: Preferences; setPref: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void; reset: () => void } | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(load);
  setDateStyle(prefs.dateStyle);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* preferences last for this page only */
    }
    const el = document.documentElement;
    el.classList.toggle("text-large", prefs.largeText);
    el.classList.toggle("reduce-motion", prefs.reduceMotion);
    el.classList.toggle("underline-links", prefs.underlineLinks);
    el.classList.toggle("focus-strong", prefs.strongFocus);
    el.classList.toggle("density-compact", prefs.density === "compact");
  }, [prefs]);
  const value = useMemo(
    () => ({
      prefs,
      setPref: <K extends keyof Preferences>(k: K, v: Preferences[K]) => setPrefs((p) => ({ ...p, [k]: v })),
      reset: () => setPrefs(DEFAULTS),
    }),
    [prefs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePreferences must be used inside PreferencesProvider");
  return c;
}
