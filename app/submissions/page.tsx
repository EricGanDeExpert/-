import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { listSubmissions } from "@/lib/queries";
import { SubmissionList } from "@/components/SubmissionList";

export default async function SubmissionsPage({ searchParams }: PageProps<"/submissions">) {
  const { supabase } = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const unassigned = sp.filter === "unassigned";
  const studentId = typeof sp.student === "string" ? sp.student : undefined;
  const items = await listSubmissions(supabase, { unassigned, studentId });

  const tab = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-ink text-white" : "bg-white border border-stone-300 text-stone-600"}`;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("subs.title")}</h1>
      <div className="flex gap-2">
        <Link href="/submissions" className={tab(!unassigned && !studentId)}>
          {t("subs.filterAll")}
        </Link>
        <Link href="/submissions?filter=unassigned" className={tab(unassigned)}>
          {t("subs.filterUnassigned")}
        </Link>
      </div>
      <SubmissionList items={items} />
    </div>
  );
}
