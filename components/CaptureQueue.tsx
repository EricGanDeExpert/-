"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareForUpload } from "@/lib/image";
import type { ClassRow, StudentRow, SubmissionKind } from "@/lib/types";
import { useT } from "./I18nProvider";

type ItemStatus = "queued" | "preparing" | "uploading" | "transcribing" | "done" | "error";
interface Item {
  id: string;
  file: File;
  preview: string;
  rotation: number;
  studentId: string;
  status: ItemStatus;
  error?: string;
  submissionId?: string;
}

const KINDS: SubmissionKind[] = ["essay", "dictation", "short_answer", "other"];
const CONCURRENCY = 3;

export function CaptureQueue({
  teacherId,
  classes,
  retentionDays,
  initialClassId,
}: {
  teacherId: string;
  classes: ClassRow[];
  retentionDays: number;
  initialClassId?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [classId, setClassId] = useState(initialClassId ?? "");
  const [kind, setKind] = useState<SubmissionKind>("essay");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [running, setRunning] = useState(false);
  const [quotaHit, setQuotaHit] = useState(false);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    createClient()
      .from("students")
      .select("id, class_id, name, student_number")
      .eq("class_id", classId)
      .order("student_number", { nullsFirst: false })
      .order("name")
      .then(({ data }) => setStudents(data ?? []));
    setItems((prev) => prev.map((it) => (it.status === "queued" ? { ...it, studentId: "" } : it)));
  }, [classId]);

  useEffect(() => () => items.forEach((it) => URL.revokeObjectURL(it.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added = Array.from(list)
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .map<Item>((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        rotation: 0,
        studentId: "",
        status: "queued",
      }));
    setItems((prev) => [...prev, ...added]);
  }

  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function remove(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((x) => x.id !== id);
    });
  }

  function assignInOrder() {
    let i = 0;
    setItems((prev) => prev.map((it) => (it.status === "queued" ? { ...it, studentId: students[i++]?.id ?? "" } : it)));
  }

  async function processItem(item: Item) {
    const supabase = createClient();
    let submissionId: string | undefined;
    try {
      update(item.id, { status: "preparing", error: undefined });
      const { blob, width, height } = await prepareForUpload(item.file, item.rotation);

      update(item.id, { status: "uploading" });
      submissionId = crypto.randomUUID();
      const pageId = crypto.randomUUID();
      const path = `${teacherId}/${submissionId}/${pageId}.jpg`;

      const { error: subErr } = await supabase.from("submissions").insert({
        id: submissionId,
        teacher_id: teacherId,
        class_id: classId || null,
        student_id: item.studentId || null,
        kind,
        status: "pending",
      });
      if (subErr) throw new Error(subErr.message);

      const { error: upErr } = await supabase.storage.from("submissions").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw new Error(upErr.message);

      const { error: pageErr } = await supabase.from("submission_pages").insert({
        id: pageId,
        submission_id: submissionId,
        teacher_id: teacherId,
        page_number: 1,
        image_path: path,
        image_expires_at: new Date(Date.now() + retentionDays * 86400_000).toISOString(),
        width,
        height,
      });
      if (pageErr) throw new Error(pageErr.message);
      update(item.id, { status: "transcribing", submissionId });

      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (res.status === 402) {
        setQuotaHit(true);
        throw new Error(t("queue.quotaExceeded"));
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      update(item.id, { status: "done" });
    } catch (err) {
      update(item.id, { status: "error", error: (err as Error).message, submissionId });
    }
  }

  async function start() {
    setRunning(true);
    const queue = items.filter((it) => it.status === "queued" || it.status === "error");
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const it = queue[next++];
        if (it.status === "error" && it.submissionId) {
          // Retry transcription only; the photo is already uploaded.
          update(it.id, { status: "transcribing", error: undefined });
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ submissionId: it.submissionId, force: true }),
          });
          if (res.status === 402) setQuotaHit(true);
          update(it.id, res.ok ? { status: "done" } : { status: "error", error: (await res.json().catch(() => ({}))).error });
        } else {
          await processItem(it);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
    router.refresh();
  }

  function clearFinished() {
    setItems((prev) => {
      prev.filter((it) => it.status === "done").forEach((it) => URL.revokeObjectURL(it.preview));
      return prev.filter((it) => it.status !== "done");
    });
  }

  const pending = items.filter((it) => it.status === "queued" || it.status === "error").length;
  const statusLabel: Record<ItemStatus, string> = {
    queued: "",
    preparing: t("queue.preparing"),
    uploading: t("queue.uploading"),
    transcribing: t("queue.transcribing"),
    done: t("queue.done"),
    error: t("queue.error"),
  };

  return (
    <section>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-6">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full bg-accent text-white shadow-lg shadow-red-900/20 transition active:scale-95"
            aria-label={t("home.camera")}
          >
            <svg viewBox="0 0 24 24" className="h-14 w-14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
              <circle cx="12" cy="13.5" r="3.8" />
            </svg>
            <span className="text-lg font-semibold">{t("home.camera")}</span>
          </button>
          <p className="mt-4 text-sm text-stone-500">{t("home.cameraHint")}</p>
          <button onClick={() => libraryRef.current?.click()} className="btn-ghost mt-2 underline-offset-4 hover:underline">
            {t("home.upload")}
          </button>
        </div>
      ) : (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t("queue.title", { n: items.length })}</h2>
            <div className="flex gap-2">
              <button onClick={() => cameraRef.current?.click()} className="btn-secondary px-3" disabled={running} aria-label={t("home.camera")}>
                📷
              </button>
              <button onClick={() => libraryRef.current?.click()} className="btn-secondary px-3" disabled={running}>
                {t("queue.addMore")}
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("queue.class")}</label>
              <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={running}>
                <option value="">{t("queue.noClass")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("queue.kind")}</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as SubmissionKind)} disabled={running}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {students.length > 0 && items.some((it) => it.status === "queued") && (
            <button onClick={assignInOrder} className="btn-ghost mb-2 px-0 text-xs text-accent" disabled={running}>
              ↧ {t("queue.assignInOrder")}
            </button>
          )}

          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.id} className="flex items-center gap-3 rounded-xl border border-stone-200 p-2">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.preview} alt="" className="h-full w-full object-cover transition-transform" style={{ transform: `rotate(${it.rotation}deg)` }} />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{idx + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  {it.status === "queued" ? (
                    <select className="input py-1.5 text-sm" value={it.studentId} onChange={(e) => update(it.id, { studentId: e.target.value })} disabled={running}>
                      <option value="">{t("queue.unassigned")}</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.student_number ? `${s.student_number}. ` : ""}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm">
                      <span className="font-medium">{students.find((s) => s.id === it.studentId)?.name ?? t("queue.unassigned")}</span>
                      <span className={`ml-2 ${it.status === "error" ? "text-red-700" : it.status === "done" ? "text-green-700" : "text-stone-500"}`}>
                        {statusLabel[it.status]}
                      </span>
                      {it.error && <p className="truncate text-xs text-red-700">{it.error}</p>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {it.status === "queued" && (
                    <>
                      <button className="btn-ghost px-2" onClick={() => update(it.id, { rotation: (it.rotation + 90) % 360 })} aria-label={t("queue.rotate")} disabled={running}>
                        ↻
                      </button>
                      <button className="btn-ghost px-2" onClick={() => remove(it.id)} aria-label={t("queue.remove")} disabled={running}>
                        ✕
                      </button>
                    </>
                  )}
                  {it.submissionId && (it.status === "done" || it.status === "error") && (
                    <Link href={`/submissions/${it.submissionId}`} className="btn-secondary px-3 py-1.5">
                      {t("queue.open")}
                    </Link>
                  )}
                  {(it.status === "preparing" || it.status === "uploading" || it.status === "transcribing") && (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-accent" />
                  )}
                </div>
              </li>
            ))}
          </ul>

          {quotaHit && (
            <div className="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-red-900">
              {t("queue.quotaExceeded")}{" "}
              <Link href="/settings#billing" className="font-semibold underline">
                {t("settings.upgrade")}
              </Link>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            {pending > 0 && (
              <button onClick={start} className="btn-primary flex-1 py-3 text-base" disabled={running}>
                {running ? t("queue.transcribing") : t("queue.start", { n: pending })}
              </button>
            )}
            {items.some((it) => it.status === "done") && !running && (
              <button onClick={clearFinished} className="btn-secondary flex-1 py-3">
                {t("queue.clear")}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
