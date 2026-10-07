import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { isLocale, localeFromAcceptLanguage } from "@/lib/i18n";
import { scriptForLocale } from "@/lib/script";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error?.message ?? "auth")}`, url.origin));
  }

  // First sign-in: seed language/script preferences from the browser (HK/TW → 繁, CN → 简).
  const { data: profile } = await supabase
    .from("profiles")
    .select("ui_locale, created_at, updated_at")
    .eq("id", data.user.id)
    .single();
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : localeFromAcceptLanguage(request.headers.get("accept-language"));
  if (profile && profile.created_at === profile.updated_at) {
    await supabase
      .from("profiles")
      .update({ ui_locale: locale, preferred_script: scriptForLocale(locale) })
      .eq("id", data.user.id);
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  res.cookies.set(LOCALE_COOKIE, profile && profile.created_at !== profile.updated_at ? profile.ui_locale : locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
