import { NextResponse, type NextRequest } from "next/server";
import type { Whop } from "@whop/sdk";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_STATUSES } from "@/lib/whop";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const MEMBERSHIP_EVENTS = new Set([
  "membership.activated",
  "membership.deactivated",
  "membership.updated",
  "membership.cancel_at_period_end_changed",
]);

async function syncMembership(m: Whop.Membership) {
  // Only the Pro plan grants Pro; ignore other products on the same Whop company.
  if (m.plan_id !== env.whopPlanIdPro) return;

  const admin = createAdminClient();
  const isPro = ACTIVE_STATUSES.has(m.status);
  const patch = {
    plan: isPro ? "pro" : "free",
    whop_membership_id: m.id,
    whop_user_id: m.user_id,
    subscription_status: m.status,
    current_period_end: m.current_period_end,
  };

  const userId = typeof m.metadata?.supabase_user_id === "string" ? m.metadata.supabase_user_id : null;
  const q = admin.from("profiles").update(patch);
  const { error } = userId ? await q.eq("id", userId) : await q.eq("whop_membership_id", m.id);
  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  let event: { type: string; data: unknown };
  try {
    event = unwrapWebhook(body, { headers: Object.fromEntries(request.headers), key: env.whopWebhookSecret });
  } catch (err) {
    const status = err instanceof WebhookVerificationError ? 400 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  if (MEMBERSHIP_EVENTS.has(event.type)) {
    try {
      await syncMembership(event.data as Whop.Membership);
    } catch (err) {
      console.error("whop webhook error", event.type, err);
      return NextResponse.json({ error: "handler failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
