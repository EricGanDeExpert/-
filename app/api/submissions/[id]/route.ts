import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteSubmissions } from "@/lib/storage";

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/submissions/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // RLS: only returns the row if the teacher owns it.
  const { data } = await supabase.from("submissions").select("id").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await deleteSubmissions(createAdminClient(), [id]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
