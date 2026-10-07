export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// Client-safe helpers (no OpenCC import here).
import type { Locale } from "../types";

export const LOCALES: Locale[] = ["zh-Hant", "zh-Hans", "en"];
export const LOCALE_LABELS: Record<Locale, string> = { "zh-Hant": "繁體中文", "zh-Hans": "简体中文", en: "English" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as string[]).includes(v);
}
