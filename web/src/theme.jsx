import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEMES = {
  paper: {
    label: "Paper",
    accent: "#8f3b2d",
    accentSoft: "#eee0da",
    canvas: "#f5f1e8",
    canvasAlt: "#ede7db",
    panel: "#fffdf8",
    ink: "#171612",
    muted: "#716b61",
    line: "#d8d0c3",
    lineStrong: "#b9afa0",
  },
  daylight: {
    label: "Daylight",
    accent: "#3157c8",
    accentSoft: "#e6ebfb",
    canvas: "#f7f8f5",
    canvasAlt: "#eef0eb",
    panel: "#ffffff",
    ink: "#171a20",
    muted: "#68707c",
    line: "#dde1e6",
    lineStrong: "#bcc3cc",
  },
  sage: {
    label: "Sage",
    accent: "#315248",
    accentSoft: "#e1ece7",
    canvas: "#f3f6f1",
    canvasAlt: "#e8eee9",
    panel: "#fbfdf9",
    ink: "#18201d",
    muted: "#65716c",
    line: "#d7e0da",
    lineStrong: "#b6c5bc",
  },
  lilac: {
    label: "Lilac",
    accent: "#6c55a3",
    accentSoft: "#ece7f7",
    canvas: "#f8f6fa",
    canvasAlt: "#efebf3",
    panel: "#fffefe",
    ink: "#211d28",
    muted: "#716b79",
    line: "#e3dee8",
    lineStrong: "#c8bfce",
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => localStorage.getItem("larik.theme") || "paper");
  const theme = THEMES[themeId] || THEMES.paper;

  useEffect(() => {
    localStorage.setItem("larik.theme", themeId);
    const root = document.documentElement;
    root.dataset.theme = themeId;
    root.style.colorScheme = "light";
    Object.entries(theme).forEach(([key, value]) => {
      if (key !== "label") root.style.setProperty(`--${key}`, value);
    });
  }, [theme, themeId]);

  const value = useMemo(() => ({ themeId, setThemeId, themes: THEMES }), [themeId]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
