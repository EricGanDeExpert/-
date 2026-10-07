import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Deletes uploaded images whose retention period has passed. Transcribed text is kept
 * until the teacher deletes it. Triggered daily by Vercel Cron (see vercel.json).
 */
export async function GET(request: NextRequest) {
  const secret = env.cronSecret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  let deleted = 0;
  for (let round = 0; round < 50; round++) {
    const { data: pages, error } = await admin
      .from("submission_pages")
      .select("id, image_path")
      .is("image_deleted_at", null)
      .lt("image_expires_at", new Date().toISOString())
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!pages?.length) break;

    const paths = pages.map((p) => p.image_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { error: rmError } = await admin.storage.from("submissions").remove(paths);
      if (rmError) return NextResponse.json({ error: rmError.message, deleted }, { status: 500 });
    }
    await admin
      .from("submission_pages")
      .update({ image_deleted_at: new Date().toISOString(), image_path: null })
      .in("id", pages.map((p) => p.id));
    deleted += pages.length;
  }
  return NextResponse.json({ ok: true, deleted });
}
