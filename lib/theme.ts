"use client";

// Tema: "system" işletim sistemi tercihini takip eder.
export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const r = resolveTheme(mode);
  document.documentElement.dataset.theme = r;
  document.documentElement.style.colorScheme = r;
}

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: "💻 Sistem",
  dark: "🌙 Koyu",
  light: "☀ Açık",
};

export function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === "system" ? "dark" : mode === "dark" ? "light" : "system";
}
