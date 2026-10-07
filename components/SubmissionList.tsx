"use client";
import Link from "next/link";
import type { SubmissionListItem } from "@/lib/queries";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./I18nProvider";

export function SubmissionList({ items, showClass = true }: { items: SubmissionListItem[]; showClass?: boolean }) {
  const { t, locale } = useT();
  if (items.length === 0) return <p className="py-8 text-center text-sm text-stone-500">{t("subs.empty")}</p>;
  const dateFmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/submissions/${s.id}`} className="flex items-start gap-3 p-3 hover:bg-stone-50 active:bg-stone-100">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-medium">{s.student?.name ?? t("queue.unassigned")}</span>
                {showClass && s.class && <span className="text-stone-400">· {s.class.name}</span>}
                <span className="text-stone-400">· {t(`kind.${s.kind}` as MessageKey)}</span>
                {s.title && <span className="text-stone-600">· {s.title}</span>}
              </div>
              <p className="mt-0.5 truncate font-[family-name:var(--font-han)] text-stone-600">{s.snippet || "…"}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
              <span className="text-stone-400">{dateFmt.format(new Date(s.created_at))}</span>
              {s.status !== "done" ? (
                <span className={`rounded-full px-2 py-0.5 ${s.status === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                  {t(`status.${s.status}` as MessageKey)}
                </span>
              ) : s.uncertainCount > 0 ? (
                <span className="rounded-full bg-unsure/60 px-2 py-0.5 text-amber-900">{t("review.uncertainCount", { n: s.uncertainCount })}</span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
