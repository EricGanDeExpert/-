import { requireUser } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/queries";
import { env } from "@/lib/env";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { supabase, user, profile } = await requireUser();
  const used = await getMonthlyUsage(supabase, user.id);
  const upgraded = (await searchParams).upgraded === "1";
  return (
    <SettingsForm
      email={user.email ?? ""}
      profile={profile!}
      used={used}
      limit={env.freePagesPerMonth}
      upgraded={upgraded}
    />
  );
}
