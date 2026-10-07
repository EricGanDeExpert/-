import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Delete submissions (rows + stored images). `admin` must be a service-role client; ids must already be ownership-checked. */
export async function deleteSubmissions(admin: SupabaseClient, submissionIds: string[]) {
  if (submissionIds.length === 0) return;
  for (let i = 0; i < submissionIds.length; i += 100) {
    const batch = submissionIds.slice(i, i + 100);
    const { data: pages } = await admin.from("submission_pages").select("image_path").in("submission_id", batch);
    const paths = (pages ?? []).map((p) => p.image_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { error } = await admin.storage.from("submissions").remove(paths);
      if (error) throw new Error(`storage delete failed: ${error.message}`);
    }
    const { error } = await admin.from("submissions").delete().in("id", batch);
    if (error) throw new Error(error.message);
  }
}
