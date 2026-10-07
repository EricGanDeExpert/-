"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/format";
import type { Locale, Profile, Script } from "@/lib/types";
import { useT } from "./I18nProvider";

export function SettingsForm({ email, profile, used, limit, upgraded }: { email: string; profile: Profile; used: number; limit: number; upgraded: boolean }) {
  const { t, locale: currentLocale } = useT();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(currentLocale);
  const [script, setScript] = useState<Script>(profile.preferred_script);
  const [retention, setRetention] = useState(profile.retention_days);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isPro = profile.plan === "pro";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const days = Math.min(365, Math.max(1, Math.round(retention)));
    const { error } = await createClient()
      .from("profiles")
      .update({ ui_locale: locale, preferred_script: script, retention_days: days })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return alert(t("common.error", { msg: error.message }));
    document.cookie = `zq_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function billing(endpoint: "checkout" | "manage") {
    setBusy(true);
    const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (body.url) window.location.href = body.url;
    else alert(t("common.error", { msg: body.error ?? res.statusText }));
  }

  async function deleteAll() {
    if (!confirm(t("settings.confirmDeleteAll"))) return;
    setBusy(true);
    const res = await fetch("/api/submissions", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      alert(t("settings.deletedAll"));
      router.refresh();
    } else alert(t("common.error", { msg: res.statusText }));
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
      {upgraded && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{t("settings.upgraded")}</p>}

      <form onSubmit={save} className="card space-y-4 p-4">
        <div>
          <label className="label">{t("settings.language")}</label>
          <div className="flex overflow-hidden rounded-xl border border-stone-300">
            {LOCALES.map((l) => (
              <button type="button" key={l} onClick={() => setLocale(l)} className={`flex-1 py-2 text-sm ${locale === l ? "bg-ink text-white" : "bg-white"}`}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t("settings.script")}</label>
          <div className="flex overflow-hidden rounded-xl border border-stone-300">
            {(["traditional", "simplified"] as Script[]).map((s) => (
              <button type="button" key={s} onClick={() => setScript(s)} className={`flex-1 py-2 text-sm ${script === s ? "bg-ink text-white" : "bg-white"}`}>
                {s === "traditional" ? "繁體" : "简体"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">{t("settings.scriptHint")}</p>
        </div>
        <div>
          <label className="label" htmlFor="retention">
            {t("settings.retention")}
          </label>
          <input id="retention" type="number" min={1} max={365} className="input w-32" value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
          <p className="mt-1 text-xs text-stone-500">{t("settings.retentionHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>
            {t("settings.save")}
          </button>
          {saved && <span className="text-sm text-green-700">{t("settings.saved")}</span>}
        </div>
      </form>

      <section id="billing" className="card space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{t("settings.plan")}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-sm ${isPro ? "bg-accent text-white" : "bg-stone-100"}`}>{isPro ? t("settings.pro") : t("settings.free")}</span>
        </div>
        {isPro ? (
          <>
            <p className="text-sm text-stone-600">{t("billing.pro")}</p>
            {profile.current_period_end && (
              <p className="text-xs text-stone-500">{t("settings.renews", { date: new Date(profile.current_period_end).toLocaleDateString(currentLocale) })}</p>
            )}
            <button onClick={() => billing("manage")} className="btn-secondary" disabled={busy}>
              {t("settings.manage")}
            </button>
          </>
        ) : (
          <>
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-stone-500">{t("home.usage", { used, limit })}</p>
            </div>
            <ul className="text-sm text-stone-600">
              <li>{t("billing.free", { limit })}</li>
              <li className="font-medium text-ink">
                {t("billing.pro")} — {t("billing.price")}
              </li>
            </ul>
            <button onClick={() => billing("checkout")} className="btn-primary w-full py-3" disabled={busy}>
              {t("settings.upgrade")}
            </button>
            {profile.whop_membership_id && (
              <button onClick={() => billing("manage")} className="btn-ghost w-full text-xs" disabled={busy}>
                {t("settings.manage")}
              </button>
            )}
          </>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t("settings.data")}</h2>
        <button onClick={deleteAll} className="btn-danger" disabled={busy}>
          {t("settings.deleteAll")}
        </button>
        <p className="text-xs">
          <Link href="/privacy" className="text-stone-500 underline">
            {t("settings.privacy")}
          </Link>
        </p>
      </section>

      <form action="/auth/signout" method="post" className="flex items-center justify-between text-sm text-stone-500">
        <span>{email}</span>
        <button className="btn-ghost">{t("settings.signOut")}</button>
      </form>
    </div>
  );
}
