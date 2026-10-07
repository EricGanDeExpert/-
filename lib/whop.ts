import "server-only";
import { WhopClient } from "@whop/sdk";
import { env } from "./env";

let client: WhopClient | null = null;
export function whop() {
  client ??= new WhopClient({ token: env.whopApiKey });
  return client;
}

/** Membership statuses that grant Pro. `canceling` = cancelled but paid through the period end. */
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "canceling"]);
