import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertTranscription } from "./script";
import type { ExportEntry } from "./docx";
import type { ScriptView, UncertainChar } from "./types";

export function parseScript(v: string | null): ScriptView {
  return v === "traditional" || v === "simplified" ? v : "original";
}

export interface ExportLabels {
  unassigned: string;
  kinds: Record<string, string>;
}

interface Row {
  id: string;
  title: string | null;
  kind: string;
  created_at: string;
  students: { name: string; student_number: string | null } | null;
  classes: { name: string } | null;
  submission_pages: { page_number: number; transcriptions: { text: string; uncertain: UncertainChar[] } | { text: string; uncertain: UncertainChar[] }[] | null }[];
}

export async function loadExportEntries(
  supabase: SupabaseClient,
  filter: { submissionId?: string; classId?: string },
  script: ScriptView,
  labels: ExportLabels,
): Promise<(ExportEntry & { studentName: string | null; className: string | null })[]> {
  let q = supabase
    .from("submissions")
    .select("id, title, kind, created_at, students(name, student_number), classes(name), submission_pages(page_number, transcriptions(text, uncertain))")
    .order("created_at", { ascending: true });
  if (filter.submissionId) q = q.eq("id", filter.submissionId);
  if (filter.classId) q = q.eq("class_id", filter.classId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  if (filter.classId) {
    rows.sort((a, b) => {
      const an = a.students?.student_number ?? "", bn = b.students?.student_number ?? "";
      if (an !== bn) return an.localeCompare(bn, undefined, { numeric: true });
      return (a.students?.name ?? "￿").localeCompare(b.students?.name ?? "￿", "zh") || a.created_at.localeCompare(b.created_at);
    });
  }

  return rows.map((r) => {
    const pages = [...r.submission_pages]
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => (Array.isArray(p.transcriptions) ? p.transcriptions[0] : p.transcriptions))
      .filter((t): t is { text: string; uncertain: UncertainChar[] } => !!t)
      .map((t) => convertTranscription(t.text, t.uncertain ?? [], script));
    const studentName = r.students?.name ?? null;
    const heading = [studentName ?? labels.unassigned, r.title].filter(Boolean).join(" · ");
    const meta = [r.classes?.name, labels.kinds[r.kind], r.created_at.slice(0, 10)].filter(Boolean).join(" · ");
    return { heading, meta, pages, studentName, className: r.classes?.name ?? null };
  });
}

export function attachment(body: BodyInit, filename: string, contentType: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}

export function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, "_").slice(0, 80) || "ziqing";
}

export async function exportLabels(): Promise<ExportLabels> {
  const { getT } = await import("./i18n/server");
  const { t } = await getT();
  return {
    unassigned: t("queue.unassigned"),
    kinds: { essay: t("kind.essay"), dictation: t("kind.dictation"), short_answer: t("kind.short_answer"), other: "" },
  };
}
