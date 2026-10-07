import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeImage, TranscriptionRefusedError } from "@/lib/transcribe";
import { env } from "@/lib/env";
import type { SubmissionKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  submissionId: z.string().uuid(),
  /** Re-run pages that already have a transcription (overwrites edits). */
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { submissionId, force } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS guarantees the teacher owns this submission.
  const { data: submission } = await supabase
    .from("submissions")
    .select("id, kind, status, submission_pages(id, image_path, image_deleted_at, page_number, transcriptions(id))")
    .eq("id", submissionId)
    .single();
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (submission.status === "processing" && !force) {
    return NextResponse.json({ error: "already_processing" }, { status: 409 });
  }

  const pages = (submission.submission_pages ?? [])
    .filter((p) => p.image_path && !p.image_deleted_at)
    .filter((p) => force || !(p.transcriptions && (Array.isArray(p.transcriptions) ? p.transcriptions.length : 1)))
    .sort((a, b) => a.page_number - b.page_number);
  if (pages.length === 0) return NextResponse.json({ status: "done", transcribed: 0 });

  const admin = createAdminClient();

  // Atomic quota check (free plan) + usage increment.
  const { data: used, error: quotaError } = await admin.rpc("consume_pages", {
    p_teacher: user.id,
    p_pages: pages.length,
    p_free_limit: env.freePagesPerMonth,
  });
  if (quotaError) return NextResponse.json({ error: quotaError.message }, { status: 500 });
  if (used === -1) {
    await admin.from("submissions").update({ status: "error", error_message: "quota_exceeded" }).eq("id", submissionId);
    return NextResponse.json({ error: "quota_exceeded" }, { status: 402 });
  }

  await admin.from("submissions").update({ status: "processing", error_message: null }).eq("id", submissionId);

  let done = 0;
  try {
    for (const page of pages) {
      const { data: blob, error: dlError } = await admin.storage.from("submissions").download(page.image_path!);
      if (dlError || !blob) throw new Error(`download failed: ${dlError?.message ?? "no data"}`);

      const out = await transcribeImage(Buffer.from(await blob.arrayBuffer()), { kind: submission.kind as SubmissionKind });

      const { error: upsertError } = await admin.from("transcriptions").upsert(
        {
          page_id: page.id,
          submission_id: submissionId,
          teacher_id: user.id,
          text: out.text,
          raw_text: out.text,
          uncertain: out.uncertain,
          illegible_count: out.illegible_count,
          detected_script: out.detected_script,
          model: out.model,
          input_tokens: out.input_tokens,
          output_tokens: out.output_tokens,
          edited_at: null,
        },
        { onConflict: "page_id" },
      );
      if (upsertError) throw new Error(upsertError.message);
      done++;
    }
    await admin.from("submissions").update({ status: "done" }).eq("id", submissionId);
    return NextResponse.json({ status: "done", transcribed: done });
  } catch (err) {
    const message = err instanceof TranscriptionRefusedError ? "refused" : (err as Error).message.slice(0, 500);
    console.error("transcription failed", submissionId, err);
    await admin.rpc("refund_pages", { p_teacher: user.id, p_pages: pages.length - done });
    await admin.from("submissions").update({ status: "error", error_message: message }).eq("id", submissionId);
    return NextResponse.json({ error: message, transcribed: done }, { status: 502 });
  }
}
