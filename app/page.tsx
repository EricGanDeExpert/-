import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { getMonthlyUsage, listSubmissions } from "@/lib/queries";
import { CaptureQueue } from "@/components/CaptureQueue";
import { SubmissionList } from "@/components/SubmissionList";
import type { ClassRow, Profile } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { t } = await getT();

  if (!user) return <Landing t={t} limit={env.freePagesPerMonth} />;

  const [{ data: profile }, { data: classes }, recent, used] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.from("classes").select("id, name, grade, created_at").order("name"),
    listSubmissions(supabase, { limit: 8 }),
    getMonthlyUsage(supabase, user.id),
  ]);
  const isPro = profile?.plan === "pro";
  const limit = env.freePagesPerMonth;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between md:hidden">
        <span className="text-2xl font-bold tracking-wide">
          字<span className="text-accent">清</span>
        </span>
        <Link href="/settings#billing" className="text-xs text-stone-500">
          {isPro ? t("home.usagePro") : t("home.usage", { used, limit })}
        </Link>
      </div>
      {!isPro && (
        <div className="hidden md:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-stone-500">{t("home.usage", { used, limit })}</p>
        </div>
      )}

      <CaptureQueue teacherId={user.id} classes={(classes ?? []) as ClassRow[]} retentionDays={profile?.retention_days ?? env.defaultRetentionDays} />

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">{t("home.recent")}</h2>
          <Link href="/submissions" className="text-sm text-accent">
            {t("home.viewAll")} →
          </Link>
        </div>
        {recent.length ? <SubmissionList items={recent} /> : <p className="py-6 text-center text-sm text-stone-500">{t("home.empty")}</p>}
      </section>
    </div>
  );
}

function Landing({ t, limit }: { t: Awaited<ReturnType<typeof getT>>["t"]; limit: number }) {
  return (
    <div className="mx-auto max-w-xl pt-10 text-center">
      <div className="text-6xl font-bold tracking-widest">
        字<span className="text-accent">清</span>
      </div>
      <h1 className="mt-8 text-2xl font-semibold leading-snug">{t("landing.title")}</h1>
      <p className="mt-4 text-stone-600">{t("landing.subtitle")}</p>

      <div className="card mx-auto mt-8 p-5 text-left">
        <p className="transcript text-lg">
          我今天和媽媽去公園，看見很多
          <mark className="rounded bg-unsure px-0.5">蝴</mark>
          蝶在花叢中飛來飛去，真是[?]麗。
        </p>
      </div>

      <ul className="mt-8 space-y-3 text-left text-sm">
        {(["landing.f1", "landing.f2", "landing.f3"] as const).map((k) => (
          <li key={k} className="flex gap-3">
            <span className="text-accent">✓</span>
            {t(k)}
          </li>
        ))}
      </ul>
      <Link href="/login" className="btn-primary mt-10 w-full py-4 text-base">
        {t("landing.cta")}
      </Link>
      <p className="mt-4 text-xs text-stone-500">{t("landing.pricing", { limit })}</p>
      <p className="mt-6 text-xs">
        <Link href="/privacy" className="text-stone-500 underline">
          {t("settings.privacy")}
        </Link>
      </p>
    </div>
  );
}
