import { convertScript } from "../script";
import type { Locale } from "../types";
import { en, zhHant, type MessageKey, type Messages } from "./messages";

export type { MessageKey, Messages };
export { LOCALES, LOCALE_LABELS, isLocale } from "./format";

let zhHans: Messages | null = null;

// Mainland wording that differs from Hong Kong/Taiwan beyond character conversion.
const ZH_HANS_OVERRIDES: Partial<Messages> = {
  "kind.dictation": "听写",
  "login.email": "邮箱地址",
  "login.sent": "登录链接已发送，请到邮箱点击链接。",
  "login.title": "登录字清",
  "login.sendLink": "发送登录链接",
  "login.google": "使用 Google 登录",
  "login.error": "登录失败：{msg}",
  "settings.signOut": "退出登录",
  "settings.privacy": "隐私政策",
  "classes.addStudentsHint": "每行一个名字，可直接粘贴整份名单",
};

export function getMessages(locale: Locale): Messages {
  if (locale === "en") return en;
  if (locale === "zh-Hans") {
    zhHans ??= Object.fromEntries(
      Object.entries(zhHant).map(([k, v]) => [k, k === "app.name" ? v : convertScript(v, "simplified")]),
    ) as Messages;
    Object.assign(zhHans, ZH_HANS_OVERRIDES);
    return zhHans;
  }
  return zhHant;
}

export { format } from "./format";


/** Map an Accept-Language header to our locales. HK/TW/MO → Traditional, CN/SG → Simplified. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return "zh-Hant";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("zh")) {
      if (tag.includes("hans") || tag.endsWith("-cn") || tag.endsWith("-sg")) return "zh-Hans";
      return "zh-Hant";
    }
    if (tag.startsWith("en")) return "en";
  }
  return "zh-Hant";
}
