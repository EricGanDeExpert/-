import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteSubmissions } from "@/lib/storage";

/** DELETE /api/submissions — delete all of the signed-in teacher's submissions and images. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from("submissions").select("id").eq("teacher_id", user.id);
  try {
    await deleteSubmissions(admin, (data ?? []).map((s) => s.id));
    // Catch any stray objects (e.g. uploads whose page row was never created).
    const { data: objects } = await admin.storage.from("submissions").list(user.id, { limit: 1000 });
    for (const folder of objects ?? []) {
      const { data: files } = await admin.storage.from("submissions").list(`${user.id}/${folder.name}`);
      const paths = (files ?? []).map((f) => `${user.id}/${folder.name}/${f.name}`);
      if (paths.length) await admin.storage.from("submissions").remove(paths);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
