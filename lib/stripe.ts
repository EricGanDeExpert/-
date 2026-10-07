import "server-only";
import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;
export function stripe() {
  client ??= new Stripe(env.stripeSecretKey);
  return client;
}

/** Subscription statuses that grant Pro. */
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
