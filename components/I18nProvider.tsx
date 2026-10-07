"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { format } from "@/lib/i18n/format";
import type { MessageKey, Messages } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

type Ctx = { locale: Locale; t: (key: MessageKey, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo<Ctx>(() => ({ locale, t: (key, vars) => format(messages[key] ?? key, vars) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx;
}
