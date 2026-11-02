"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const icons: Record<Theme, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    </svg>
  ),
};

const labels: Record<Theme, string> = { system: "Match system", light: "Light", dark: "Dark" };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
  }

  return (
    <div className="theme" role="radiogroup" aria-label="Colour theme">
      {(Object.keys(labels) as Theme[]).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} aria-label={labels[t]} title={labels[t]} onClick={() => choose(t)}>
          {icons[t]}
        </button>
      ))}
    </div>
  );
}
