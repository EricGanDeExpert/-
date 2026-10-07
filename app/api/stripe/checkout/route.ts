import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id, plan").eq("id", user.id).single();
  if (profile?.plan === "pro") return NextResponse.json({ url: `${env.siteUrl}/settings` });

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: user.email, metadata: { supabase_user_id: user.id } });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const locale = await getLocale();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: env.stripePriceIdPro, quantity: 1 }],
    allow_promotion_codes: true,
    // Stripe Checkout picks the customer's local currency if the price has HKD/CNY currency options.
    locale: locale === "en" ? "en" : locale === "zh-Hans" ? "zh" : "zh-HK",
    subscription_data: { metadata: { supabase_user_id: user.id } },
    success_url: `${env.siteUrl}/settings?upgraded=1#billing`,
    cancel_url: `${env.siteUrl}/settings#billing`,
  });
  return NextResponse.json({ url: session.url });
}
