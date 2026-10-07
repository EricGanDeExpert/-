import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/** Service-role client. Bypasses RLS — only use after checking ownership yourself. */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
