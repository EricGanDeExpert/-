import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDocx } from "@/lib/docx";
import { attachment, exportLabels, loadExportEntries, parseScript, safeName } from "@/lib/export";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/submission/[id]">) {
  const { id } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "txt";
  const script = parseScript(request.nextUrl.searchParams.get("script"));

  const supabase = await createClient();
  const [entry] = await loadExportEntries(supabase, { submissionId: id }, script, await exportLabels());
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const base = safeName(`${entry.heading}_${entry.meta.split(" · ").pop()}`);
  if (format === "txt") {
    const text = entry.pages.map((p) => p.text).join("\n\n") + "\n";
    return attachment("﻿" + text, `${base}.txt`, "text/plain; charset=utf-8");
  }
  const buf = await buildDocx([entry], script);
  return attachment(new Uint8Array(buf), `${base}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
