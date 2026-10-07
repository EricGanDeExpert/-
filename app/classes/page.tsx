import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";
import { NewClassForm } from "@/components/ClassForms";

export default async function ClassesPage() {
  const { supabase } = await requireUser();
  const { t } = await getT();
  const { data: classes } = await supabase.from("classes").select("id, name, grade, students(count), submissions(count)").order("name");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t("classes.title")}</h1>
      <NewClassForm />
      {classes?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => {
            const students = (c.students as unknown as { count: number }[])[0]?.count ?? 0;
            const subs = (c.submissions as unknown as { count: number }[])[0]?.count ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/classes/${c.id}`} className="card block p-4 hover:border-stone-400">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-semibold">{c.name}</span>
                    {c.grade && <span className="text-sm text-stone-500">{c.grade}</span>}
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {t("classes.students", { n: students })} · {t("classes.submissions")} {subs}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-stone-500">{t("classes.empty")}</p>
      )}
    </div>
  );
}
