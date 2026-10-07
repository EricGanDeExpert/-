import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale } from "../types";
import { format, getMessages, isLocale, localeFromAcceptLanguage, type MessageKey } from "./index";

export const LOCALE_COOKIE = "zq_locale";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return {
    locale,
    messages,
    t: (key: MessageKey, vars?: Record<string, string | number>) => format(messages[key], vars),
  };
}
