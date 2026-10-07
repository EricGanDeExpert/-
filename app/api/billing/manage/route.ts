import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whop } from "@/lib/whop";

/** Returns Whop's self-serve page for the teacher's membership (cancel, update card, receipts). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("whop_membership_id").eq("id", user.id).single();
  if (!profile?.whop_membership_id) return NextResponse.json({ error: "no_membership" }, { status: 400 });

  const membership = await whop().memberships.retrieve({ id: profile.whop_membership_id });
  return NextResponse.json({ url: membership.manage_url ?? "https://whop.com/@me/settings/memberships/" });
}
