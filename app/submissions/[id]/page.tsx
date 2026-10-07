import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { ReviewScreen, type ReviewPage } from "@/components/ReviewScreen";
import type { ClassRow, StudentRow, SubmissionRow, TranscriptionRow } from "@/lib/types";

export default async function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, class_id, student_id, title, kind, status, error_message, created_at, submission_pages(id, page_number, image_path, image_deleted_at, transcriptions(id, page_id, submission_id, text, raw_text, uncertain, illegible_count, edited_at))")
    .eq("id", id)
    .single();
  if (!submission) notFound();

  const rawPages = [...(submission.submission_pages ?? [])].sort((a, b) => a.page_number - b.page_number);
  const pages: ReviewPage[] = await Promise.all(
    rawPages.map(async (p) => {
      let imageUrl: string | null = null;
      if (p.image_path && !p.image_deleted_at) {
        const { data } = await supabase.storage.from("submissions").createSignedUrl(p.image_path, 60 * 60);
        imageUrl = data?.signedUrl ?? null;
      }
      const tr = Array.isArray(p.transcriptions) ? p.transcriptions[0] : p.transcriptions;
      return {
        id: p.id,
        pageNumber: p.page_number,
        imageUrl,
        imageDeleted: !!p.image_deleted_at,
        transcription: (tr as TranscriptionRow | null) ?? null,
      };
    }),
  );

  const [{ data: classes }, { data: students }] = await Promise.all([
    supabase.from("classes").select("id, name, grade, created_at").order("name"),
    supabase.from("students").select("id, class_id, name, student_number").order("name"),
  ]);

  const { submission_pages: _omit, ...sub } = submission;
  return (
    <ReviewScreen
      key={submission.status + (pages[0]?.transcription?.id ?? "")}
      submission={sub as SubmissionRow}
      pages={pages}
      classes={(classes ?? []) as ClassRow[]}
      students={(students ?? []) as StudentRow[]}
      preferredScript={profile?.preferred_script ?? "traditional"}
    />
  );
}
