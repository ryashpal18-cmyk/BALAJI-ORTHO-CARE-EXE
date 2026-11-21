import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type ThemeMode = "scifi" | "light" | "dark";
const themeOrder: ThemeMode[] = ["scifi", "light", "dark"];

const THEME_KEY = "bocc_visual_theme";

interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "scifi" || saved === "light" || saved === "dark") return saved;
  } catch {
    // Some environments disable local storage.
  }
  return "scifi";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode !== "light");
    root.dataset.visualTheme = mode;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const toggleTheme = () => setModeState((prev) => themeOrder[(themeOrder.indexOf(prev) + 1) % themeOrder.length]);

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
