function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get whopApiKey() {
    return required("WHOP_API_KEY");
  },
  get whopWebhookSecret() {
    return required("WHOP_WEBHOOK_SECRET");
  },
  get whopPlanIdPro() {
    return required("WHOP_PLAN_ID_PRO");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
  get freePagesPerMonth() {
    return Number(process.env.FREE_PAGES_PER_MONTH ?? 20);
  },
  get defaultRetentionDays() {
    return Number(process.env.DEFAULT_RETENTION_DAYS ?? 30);
  },
  get cronSecret() {
    return process.env.CRON_SECRET;
  },
};
