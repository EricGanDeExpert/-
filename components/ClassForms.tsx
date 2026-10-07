"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClassRow, Script, ScriptView, StudentRow } from "@/lib/types";
import { useT } from "./I18nProvider";

export function NewClassForm() {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("classes")
      .insert({ teacher_id: user!.id, name: name.trim(), grade: grade.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) return alert(t("common.error", { msg: error.message }));
    router.push(`/classes/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-[2]">
        <label className="label">{t("classes.name")}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("classes.namePlaceholder")} required />
      </div>
      <div className="min-w-24 flex-1">
        <label className="label">{t("classes.grade")}</label>
        <input className="input" value={grade} onChange={(e) => setGrade(e.target.value)} />
      </div>
      <button className="btn-primary py-3" disabled={busy}>
        + {t("classes.create")}
      </button>
    </form>
  );
}

export function ClassHeader({ cls, preferredScript }: { cls: ClassRow; preferredScript: Script }) {
  const { t } = useT();
  const router = useRouter();
  const [script, setScript] = useState<ScriptView>("original");

  async function del() {
    if (!confirm(t("classes.confirmDeleteClass"))) return;
    const { error } = await createClient().from("classes").delete().eq("id", cls.id);
    if (error) return alert(t("common.error", { msg: error.message }));
    router.push("/classes");
    router.refresh();
  }

  const other: Script = preferredScript === "traditional" ? "simplified" : "traditional";
  const label = (s: ScriptView) => (s === "original" ? t("review.scriptOriginal") : s === "traditional" ? t("review.scriptTrad") : t("review.scriptSimp"));
  return (
    <div className="space-y-3">
      <Link href="/classes" className="text-sm text-stone-500">
        ← {t("classes.title")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{cls.name}</h1>
        {cls.grade && <span className="text-stone-500">{cls.grade}</span>}
        <div className="ml-auto flex items-center gap-2">
          <select className="input w-auto py-2 text-sm" value={script} onChange={(e) => setScript(e.target.value as ScriptView)}>
            {(["original", preferredScript, other] as ScriptView[]).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <a href={`/api/export/class/${cls.id}?script=${script}`} className="btn-secondary">
            {t("classes.exportDocx")}
          </a>
        </div>
      </div>
      <button onClick={del} className="text-xs text-red-700 underline">
        {t("classes.deleteClass")}
      </button>
    </div>
  );
}

export function Roster({ classId, students }: { classId: string; students: StudentRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // Accept "12 陳小明", "12. 陳小明", "12,陳小明" or just "陳小明".
    const rows = names
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(\d{1,3})[\s.,、:：\t]+(.+)$/);
        return m ? { student_number: m[1], name: m[2].trim() } : { student_number: null, name: l };
      });
    if (!rows.length) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("students").insert(rows.map((r) => ({ ...r, class_id: classId, teacher_id: user!.id })));
    setBusy(false);
    if (error) return alert(t("common.error", { msg: error.message }));
    setNames("");
    router.refresh();
  }

  async function removeStudent(s: StudentRow) {
    if (!confirm(t("classes.confirmRemoveStudent", { name: s.name }))) return;
    await createClient().from("students").delete().eq("id", s.id);
    router.refresh();
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">
        {t("classes.studentsTitle")} <span className="text-sm font-normal text-stone-500">({students.length})</span>
      </h2>
      {students.length === 0 ? (
        <p className="mb-3 text-sm text-stone-500">{t("classes.noStudents")}</p>
      ) : (
        <ul className="mb-4 flex flex-wrap gap-2">
          {students.map((s) => (
            <li key={s.id} className="group flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 py-1 pl-3 pr-1 text-sm">
              <Link href={`/submissions?student=${s.id}`} className="hover:underline">
                {s.student_number && <span className="text-stone-400">{s.student_number}. </span>}
                {s.name}
              </Link>
              <button onClick={() => removeStudent(s)} className="rounded-full px-1.5 text-stone-400 hover:bg-stone-200 hover:text-red-700" aria-label={t("classes.removeStudent")}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-2">
        <label className="label">
          {t("classes.addStudents")} — {t("classes.addStudentsHint")}
        </label>
        <textarea className="input min-h-24 font-[family-name:var(--font-han)]" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"1 陳大文\n2 李小明"} />
        <button className="btn-secondary" disabled={busy || !names.trim()}>
          {t("classes.add")}
        </button>
      </form>
    </section>
  );
}
