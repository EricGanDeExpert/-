import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { listSubmissions } from "@/lib/queries";
import { SubmissionList } from "@/components/SubmissionList";
import { CaptureQueue } from "@/components/CaptureQueue";
import { ClassHeader, Roster } from "@/components/ClassForms";
import type { ClassRow, StudentRow } from "@/lib/types";

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser();
  const { t } = await getT();

  const { data: cls } = await supabase.from("classes").select("id, name, grade, created_at").eq("id", id).maybeSingle<ClassRow>();
  if (!cls) notFound();

  const [{ data: students }, { data: classes }, submissions] = await Promise.all([
    supabase.from("students").select("id, class_id, name, student_number").eq("class_id", id).order("student_number", { nullsFirst: false }).order("name"),
    supabase.from("classes").select("id, name, grade, created_at").order("name"),
    listSubmissions(supabase, { classId: id }),
  ]);

  return (
    <div className="space-y-6">
      <ClassHeader cls={cls} preferredScript={profile?.preferred_script ?? "traditional"} />
      <CaptureQueue
        teacherId={user.id}
        classes={(classes ?? []) as ClassRow[]}
        retentionDays={profile?.retention_days ?? env.defaultRetentionDays}
        initialClassId={id}
      />
      <section>
        <h2 className="mb-2 font-semibold">{t("classes.submissions")}</h2>
        <SubmissionList items={submissions} showClass={false} />
      </section>
      <Roster classId={id} students={(students ?? []) as StudentRow[]} />
    </div>
  );
}
