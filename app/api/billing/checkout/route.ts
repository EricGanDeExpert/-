import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whop } from "@/lib/whop";
import { env } from "@/lib/env";

/** Creates a Whop checkout for the Pro plan, tagged with the teacher's id so the webhook can match it. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if (profile?.plan === "pro") return NextResponse.json({ url: `${env.siteUrl}/settings#billing` });

  const config = await whop().checkoutConfigurations.create({
    plan_id: env.whopPlanIdPro,
    // Copied onto the resulting membership; the webhook uses it to find the profile.
    metadata: { supabase_user_id: user.id },
    redirect_url: `${env.siteUrl}/settings?upgraded=1#billing`,
  });
  if (!config.purchase_url) return NextResponse.json({ error: "no_checkout_url" }, { status: 502 });
  return NextResponse.json({ url: config.purchase_url });
}
