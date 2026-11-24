"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICT } from "./dict";
import { LANGS, type Lang } from "@/lib/format";

const IDX: Record<Lang, number> = { en: 0, fa: 1, ru: 2, de: 3 };

type I18n = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tr: (key: string, fallback: string) => string;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const Ctx = createContext<I18n | null>(null);

export function Providers({ initialLang, initialTheme, children }: { initialLang: Lang; initialTheme: "light" | "dark"; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const dir = lang === "fa" ? "rtl" : "ltr";

  // Cookies hydrate the first server render; localStorage restores preferences even
  // when the browser blocks cookies or a client navigation remounts the provider.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const savedLang = localStorage.getItem("vvsm_lang");
        const savedTheme = localStorage.getItem("vvsm_theme");
        if (savedLang && savedLang in IDX) setLangState(savedLang as Lang);
        if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      } catch { /* storage disabled: server cookie remains the fallback */ }
    });
    return () => { active = false; };
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `vvsm_lang=${l};path=/;max-age=31536000;samesite=lax`;
    try { localStorage.setItem("vvsm_lang", l); } catch { /* cookie remains the fallback */ }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `vvsm_theme=${next};path=/;max-age=31536000;samesite=lax`;
    try { localStorage.setItem("vvsm_theme", next); } catch { /* cookie remains the fallback */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [lang, dir, theme]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const e = DICT[key];
      let s = e ? e[IDX[lang]] || e[0] : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang]
  );
  const tr = useCallback((key: string, fallback: string) => (DICT[key] ? t(key) : fallback), [t]);

  const value = useMemo(() => ({ lang, dir: dir as "rtl" | "ltr", setLang, t, tr, theme, toggleTheme }), [lang, dir, setLang, t, tr, theme, toggleTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <select
      aria-label="language"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className="input !w-auto !py-1.5 !pe-7 !ps-2 cursor-pointer text-xs font-semibold"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {compact ? l.code.toUpperCase() : l.label}
        </option>
      ))}
    </select>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme, t } = useI18n();
  return (
    <button className="btn !px-2.5" onClick={toggleTheme} title={t("common.darkMode")} aria-label={t("common.darkMode")}>
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
