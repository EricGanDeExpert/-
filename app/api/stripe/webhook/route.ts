import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, ACTIVE_STATUSES } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

async function syncSubscription(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const periodEnd = sub.items.data.reduce((max, it) => Math.max(max, it.current_period_end ?? 0), 0);
  const isPro = ACTIVE_STATUSES.has(sub.status);

  const patch = {
    plan: isPro ? "pro" : "free",
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };

  // Prefer the user id we stamped on the subscription; fall back to the customer id.
  const userId = sub.metadata?.supabase_user_id;
  const q = admin.from("profiles").update(patch);
  const { error } = userId ? await q.eq("id", userId) : await q.eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
  if (userId) await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId).is("stripe_customer_id", null);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, env.stripeWebhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          if (!sub.metadata?.supabase_user_id && session.client_reference_id) {
            sub.metadata = { ...sub.metadata, supabase_user_id: session.client_reference_id };
          }
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(event.data.object);
        break;
    }
  } catch (err) {
    console.error("stripe webhook error", event.type, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
