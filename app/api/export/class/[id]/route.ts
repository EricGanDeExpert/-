import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDocx } from "@/lib/docx";
import { attachment, exportLabels, loadExportEntries, parseScript, safeName } from "@/lib/export";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/class/[id]">) {
  const { id } = await ctx.params;
  const script = parseScript(request.nextUrl.searchParams.get("script"));
  const supabase = await createClient();

  const { data: cls } = await supabase.from("classes").select("id, name").eq("id", id).maybeSingle();
  if (!cls) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const entries = (await loadExportEntries(supabase, { classId: id }, script, await exportLabels())).filter((e) => e.pages.length > 0);
  const date = new Date().toISOString().slice(0, 10);
  const buf = await buildDocx(entries, script, `${cls.name}（${date}）`);
  return attachment(new Uint8Array(buf), `${safeName(cls.name)}_${date}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
