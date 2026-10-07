"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { countIllegible, ILLEGIBLE, remapUncertain, resolveUncertain } from "@/lib/markers";
import type { ClassRow, Script, ScriptView, StudentRow, SubmissionRow, TranscriptionRow, UncertainChar } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./I18nProvider";

type Convert = typeof import("@/lib/script").convertTranscription;
const identity: Convert = (text, uncertain) => ({ text, uncertain });

/** OpenCC's dictionaries are ~1 MB, so only load them when the teacher asks for conversion. */
function useConverter(view: ScriptView): Convert | null {
  const [fn, setFn] = useState<Convert | null>(null);
  useEffect(() => {
    if (view === "original" || fn) return;
    import("@/lib/script").then((m) => setFn(() => m.convertTranscription));
  }, [view, fn]);
  return view === "original" ? identity : fn;
}

export interface ReviewPage {
  id: string;
  pageNumber: number;
  imageUrl: string | null;
  imageDeleted: boolean;
  transcription: TranscriptionRow | null;
}

export function ReviewScreen({
  submission,
  pages,
  classes,
  students,
  preferredScript,
}: {
  submission: SubmissionRow;
  pages: ReviewPage[];
  classes: ClassRow[];
  students: StudentRow[];
  preferredScript: Script;
}) {
  const { t } = useT();
  const router = useRouter();
  const [view, setView] = useState<ScriptView>("original");
  const convert = useConverter(view) ?? identity;
  const [texts, setTexts] = useState(() =>
    Object.fromEntries(pages.map((p) => [p.id, { text: p.transcription?.text ?? "", uncertain: p.transcription?.uncertain ?? [] }])),
  );
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const processing = submission.status === "pending" || submission.status === "processing";

  // While the server is transcribing, refresh periodically.
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [processing, router]);

  const fullText = useMemo(
    () =>
      pages
        .map((p) => convert(texts[p.id].text, [], view).text)
        .filter(Boolean)
        .join("\n\n"),
    [pages, texts, view, convert],
  );

  async function copy() {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function transcribe(force: boolean) {
    if (force && !confirm(t("review.confirmRetranscribe"))) return;
    setBusy(true);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionId: submission.id, force }),
    });
    setBusy(false);
    if (!res.ok && res.status === 402) alert(t("queue.quotaExceeded"));
    router.refresh();
  }

  async function remove() {
    if (!confirm(t("review.confirmDelete"))) return;
    setBusy(true);
    const res = await fetch(`/api/submissions/${submission.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/submissions");
      router.refresh();
    } else alert(t("common.error", { msg: res.statusText }));
  }

  const exportScript = view === "original" ? "original" : view;
  const exportHref = (format: "txt" | "docx") => `/api/export/submission/${submission.id}?format=${format}&script=${exportScript}`;
  const totalUncertain = Object.values(texts).reduce((n, x) => n + x.uncertain.length, 0);
  const totalIllegible = Object.values(texts).reduce((n, x) => n + countIllegible(x.text), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => router.back()} className="btn-ghost -ml-2 px-2">
          ← {t("common.back")}
        </button>
        <div className="flex gap-2">
          {submission.status === "done" && (
            <button onClick={() => transcribe(true)} className="btn-ghost px-2 text-xs" disabled={busy}>
              ↻ {t("review.retranscribe")}
            </button>
          )}
          <button onClick={remove} className="btn-danger px-3 py-1.5 text-xs" disabled={busy}>
            {t("review.delete")}
          </button>
        </div>
      </div>

      <MetaEditor submission={submission} classes={classes} students={students} />

      {processing && (
        <div className="card flex items-center gap-3 p-4 text-sm text-stone-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-accent" />
          {t("review.pending")}
        </div>
      )}
      {submission.status === "error" && (
        <div className="card flex items-center justify-between gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t("review.failed", { msg: submission.error_message === "quota_exceeded" ? t("queue.quotaExceeded") : (submission.error_message ?? "") })}</span>
          <button onClick={() => transcribe(true)} className="btn-secondary shrink-0" disabled={busy}>
            {t("review.retry")}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-paper/95 px-4 py-2 backdrop-blur md:top-[57px]">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm" role="group">
          {(
            [
              ["original", "review.scriptOriginal"],
              [preferredScript, preferredScript === "traditional" ? "review.scriptTrad" : "review.scriptSimp"],
              [preferredScript === "traditional" ? "simplified" : "traditional", preferredScript === "traditional" ? "review.scriptSimp" : "review.scriptTrad"],
            ] as [ScriptView, MessageKey][]
          ).map(([v, k]) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-ink text-white" : "bg-white"}`}>
              {t(k)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={copy} className="btn-secondary px-3 py-1.5" disabled={!fullText}>
            {copied ? t("review.copied") : t("review.copy")}
          </button>
          <a href={exportHref("txt")} className="btn-secondary px-3 py-1.5">
            {t("review.txt")}
          </a>
          <a href={exportHref("docx")} className="btn-secondary px-3 py-1.5">
            {t("review.docx")}
          </a>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        {totalUncertain > 0 && <span className="rounded bg-unsure/70 px-1.5 text-amber-900">{t("review.uncertainCount", { n: totalUncertain })}</span>}
        {totalIllegible > 0 && <span className="rounded bg-red-100 px-1.5 text-red-800">{t("review.illegibleCount", { n: totalIllegible })}</span>}
        <span>{view === "original" ? t("review.legend") : t("review.convertNote")}</span>
      </div>

      {pages.map((p) => (
        <PageReview
          key={p.id}
          page={p}
          showPageNumber={pages.length > 1}
          view={view}
          convert={convert}
          value={texts[p.id]}
          onChange={(v) => setTexts((prev) => ({ ...prev, [p.id]: v }))}
        />
      ))}
    </div>
  );
}

function MetaEditor({ submission, classes, students }: { submission: SubmissionRow; classes: ClassRow[]; students: StudentRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const [classId, setClassId] = useState(submission.class_id ?? "");
  const [studentId, setStudentId] = useState(submission.student_id ?? "");
  const [title, setTitle] = useState(submission.title ?? "");
  const [kind, setKind] = useState(submission.kind);

  async function save(patch: Record<string, unknown>) {
    await createClient().from("submissions").update(patch).eq("id", submission.id);
    router.refresh();
  }

  const classStudents = students.filter((s) => s.class_id === classId);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div>
        <label className="label">{t("review.class")}</label>
        <select
          className="input py-2 text-sm"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setStudentId("");
            save({ class_id: e.target.value || null, student_id: null });
          }}
        >
          <option value="">{t("queue.noClass")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t("review.student")}</label>
        <select
          className="input py-2 text-sm"
          value={studentId}
          disabled={!classId}
          onChange={(e) => {
            setStudentId(e.target.value);
            save({ student_id: e.target.value || null });
          }}
        >
          <option value="">{t("queue.unassigned")}</option>
          {classStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.student_number ? `${s.student_number}. ` : ""}
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t("queue.kind")}</label>
        <select
          className="input py-2 text-sm"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as SubmissionRow["kind"]);
            save({ kind: e.target.value });
          }}
        >
          {(["essay", "dictation", "short_answer", "other"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t("review.title")}</label>
        <input
          className="input py-2 text-sm"
          value={title}
          placeholder={t("review.titlePlaceholder")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== (submission.title ?? "") && save({ title: title || null })}
        />
      </div>
    </div>
  );
}

type Value = { text: string; uncertain: UncertainChar[] };
type SaveState = "idle" | "dirty" | "saving" | "saved";

function PageReview({
  page,
  showPageNumber,
  view,
  convert,
  value,
  onChange,
}: {
  page: ReviewPage;
  showPageNumber: boolean;
  view: ScriptView;
  convert: Convert;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [picked, setPicked] = useState<UncertainChar | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const tr = page.transcription;

  const shown = useMemo(() => convert(value.text, value.uncertain, view), [value, view, convert]);

  async function persist(v: Value) {
    if (!tr) return;
    setSaveState("saving");
    const { error } = await createClient()
      .from("transcriptions")
      .update({ text: v.text, uncertain: v.uncertain, illegible_count: countIllegible(v.text), edited_at: new Date().toISOString() })
      .eq("id", tr.id);
    setSaveState(error ? "dirty" : "saved");
    if (error) alert(t("common.error", { msg: error.message }));
  }

  function onEdit(next: string) {
    onChange({ text: next, uncertain: remapUncertain(value.text, next, value.uncertain) });
    setSaveState("dirty");
  }

  function choose(u: UncertainChar, replacement: string) {
    const next = resolveUncertain(value.text, value.uncertain, u.index, replacement);
    onChange(next);
    setPicked(null);
    persist(next);
  }

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (saveState !== "dirty") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="md:sticky md:top-[120px] md:self-start">
        {showPageNumber && <p className="label">{t("review.page", { n: page.pageNumber })}</p>}
        {page.imageUrl ? (
          <button onClick={() => setImageExpanded((x) => !x)} className="block w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100" title={t("review.zoom")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.imageUrl}
              alt={t("review.original")}
              className={`mx-auto w-full object-contain ${imageExpanded ? "" : "max-h-[45vh] md:max-h-[80vh]"}`}
            />
          </button>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            {page.imageDeleted ? t("review.imageDeleted") : "—"}
          </div>
        )}
      </div>

      <div className="card relative p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-500">{t("review.transcription")}</h3>
          {tr && view === "original" && (
            <div className="flex items-center gap-2">
              {saveState === "saving" && <span className="text-xs text-stone-400">{t("review.saving")}</span>}
              {saveState === "saved" && <span className="text-xs text-green-700">{t("review.saved")}</span>}
              {saveState === "dirty" && <span className="text-xs text-amber-700">{t("review.unsaved")}</span>}
              {editing ? (
                <button
                  className="btn-primary px-3 py-1.5"
                  onClick={async () => {
                    await persist(value);
                    setEditing(false);
                  }}
                >
                  {t("review.save")}
                </button>
              ) : (
                <button className="btn-secondary px-3 py-1.5" onClick={() => setEditing(true)}>
                  {t("review.edit")}
                </button>
              )}
            </div>
          )}
        </div>

        {!tr ? (
          <p className="py-6 text-center text-sm text-stone-400">{t("review.pending")}</p>
        ) : editing && view === "original" ? (
          <textarea
            className="transcript min-h-[50vh] w-full resize-y rounded-xl border border-stone-300 p-3 outline-none focus:border-accent"
            value={value.text}
            onChange={(e) => onEdit(e.target.value)}
            autoFocus
          />
        ) : (
          <Highlighted text={shown.text} uncertain={shown.uncertain} interactive={view === "original"} onPick={setPicked} />
        )}
      </div>

      {picked && (
        <AlternativesSheet
          u={picked}
          onClose={() => setPicked(null)}
          onChoose={(r) => choose(picked, r)}
        />
      )}
    </section>
  );
}

function Highlighted({
  text,
  uncertain,
  interactive,
  onPick,
}: {
  text: string;
  uncertain: UncertainChar[];
  interactive: boolean;
  onPick: (u: UncertainChar) => void;
}) {
  const chars = Array.from(text);
  const byIndex = new Map(uncertain.map((u) => [u.index, u]));
  const out: React.ReactNode[] = [];
  let buf = "";
  const flush = (key: string) => {
    if (!buf) return;
    // Mark [?] (illegible) inside plain runs.
    const parts = buf.split(ILLEGIBLE);
    parts.forEach((part, i) => {
      if (part) out.push(<span key={`${key}-${i}`}>{part}</span>);
      if (i < parts.length - 1)
        out.push(
          <span key={`${key}-${i}-q`} className="mx-px rounded bg-red-100 px-0.5 font-sans text-sm text-red-700">
            {ILLEGIBLE}
          </span>,
        );
    });
    buf = "";
  };

  for (let i = 0; i < chars.length; ) {
    const u = byIndex.get(i);
    if (u) {
      flush(`p${i}`);
      const len = Math.max(1, Array.from(u.char).length);
      const label = chars.slice(i, i + len).join("");
      out.push(
        interactive ? (
          <button key={`u${i}`} onClick={() => onPick(u)} className="rounded bg-unsure px-0.5 underline decoration-amber-500 decoration-dotted underline-offset-4 hover:bg-amber-300">
            {label}
          </button>
        ) : (
          <mark key={`u${i}`} className="rounded bg-unsure px-0.5">
            {label}
          </mark>
        ),
      );
      i += len;
    } else {
      buf += chars[i];
      i++;
    }
  }
  flush("end");
  return <div className="transcript">{out}</div>;
}

function AlternativesSheet({ u, onClose, onChoose }: { u: UncertainChar; onClose: () => void; onChoose: (r: string) => void }) {
  const { t } = useT();
  const [custom, setCustom] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-stone-500">{t("review.alternatives")}</span>
          <button onClick={onClose} className="btn-ghost px-2" aria-label={t("common.cancel")}>
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onChoose(u.char)} className="btn-secondary min-w-16 border-amber-400 bg-unsure/40 text-2xl">
            <span className="font-[family-name:var(--font-han)]">{u.char}</span>
            <span className="text-xs text-stone-500">✓</span>
          </button>
          {u.alternatives.map((a) => (
            <button key={a} onClick={() => onChoose(a)} className="btn-secondary min-w-16 text-2xl">
              <span className="font-[family-name:var(--font-han)]">{a}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("review.keep", { c: u.char })}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) onChoose(custom.trim());
          }}
        >
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t("review.custom")} />
          <button className="btn-primary shrink-0">OK</button>
        </form>
      </div>
    </div>
  );
}
