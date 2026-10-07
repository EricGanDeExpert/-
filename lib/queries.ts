import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SubmissionListItem {
  id: string;
  title: string | null;
  kind: string;
  status: string;
  created_at: string;
  student: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  snippet: string;
  uncertainCount: number;
}

export async function listSubmissions(
  supabase: SupabaseClient,
  opts: { limit?: number; classId?: string; studentId?: string; unassigned?: boolean } = {},
): Promise<SubmissionListItem[]> {
  let q = supabase
    .from("submissions")
    .select("id, title, kind, status, created_at, students(id, name), classes(id, name), transcriptions(text, uncertain)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.classId) q = q.eq("class_id", opts.classId);
  if (opts.studentId) q = q.eq("student_id", opts.studentId);
  if (opts.unassigned) q = q.is("student_id", null);
  const { data } = await q;
  return (data ?? []).map((s) => {
    const tr = (s.transcriptions ?? []) as { text: string; uncertain: unknown[] }[];
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      status: s.status,
      created_at: s.created_at,
      student: (s.students as unknown as { id: string; name: string } | null) ?? null,
      class: (s.classes as unknown as { id: string; name: string } | null) ?? null,
      snippet: tr.map((x) => x.text).join(" ").replace(/\s+/g, " ").slice(0, 80),
      uncertainCount: tr.reduce((n, x) => n + (x.uncertain?.length ?? 0), 0),
    };
  });
}

export async function getMonthlyUsage(supabase: SupabaseClient, teacherId: string): Promise<number> {
  const period = new Date().toISOString().slice(0, 7);
  const { data } = await supabase
    .from("usage_counters")
    .select("pages_used")
    .eq("teacher_id", teacherId)
    .eq("period", period)
    .maybeSingle();
  return data?.pages_used ?? 0;
}
