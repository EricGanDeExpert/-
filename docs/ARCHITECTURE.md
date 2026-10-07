# 字清 — Architecture

## Data model

```
auth.users ─┬─ profiles            (locale, preferred script, retention days, plan, Stripe ids, org id*)
            ├─ classes ─── students
            ├─ submissions ──┬── submission_pages ─── transcriptions
            │   (class?, student?, kind, status)        (text, raw_text, uncertain[], illegible_count)
            └─ usage_counters  (teacher, 'YYYY-MM', pages_used)

organizations ─ organization_members          (* Phase 2: school/team licenses)
```

| Table | Purpose |
|---|---|
| `profiles` | One per teacher. UI locale, preferred output script, image retention (days), plan + Stripe subscription state. Billing columns are writable only by the service role. |
| `classes`, `students` | Organisation for a teacher's classes. Deleting a class cascades to students; submissions keep their text but lose the link. |
| `submissions` | One piece of student work. `class_id` / `student_id` are nullable so photos can stay unassigned. `kind` = essay / dictation / short_answer / other. |
| `submission_pages` | One photo each. `image_path` points into the private `submissions` storage bucket (`{teacher}/{submission}/{page}.jpg`). `image_expires_at` drives automatic deletion; `image_deleted_at` records it. |
| `transcriptions` | Faithful text per page. `raw_text` keeps the model's output untouched for accuracy comparison; `text` holds the teacher-edited version. `uncertain` = `[{index, char, alternatives}]` with code-point indices into `text`. |
| `usage_counters` | Pages transcribed per calendar month (UTC). `consume_pages()` checks and increments atomically; `refund_pages()` gives pages back on failure. |

Row-level security restricts every table and the storage bucket to the owning teacher.

### Phase 2 hooks (not built)

- **Rubric marking & AI feedback** → new `rubrics (id, teacher_id, organization_id, name, criteria jsonb)` and `assessments (submission_id, rubric_id, scores jsonb, feedback, model)` tables keyed on `submissions`.
- **Error detection (錯別字 / grammar)** → new `text_annotations (transcription_id, start, end, kind, suggestion, source)` table. The transcription stays faithful; annotations sit beside it, never inside it.
- **School/team licenses** → `organizations` + `organization_members` already exist; `profiles.organization_id` and `submissions.organization_id` are in place. Entitlement check becomes “profile is pro OR org plan is school”.

## Request flow

1. **Capture** (client): photos are EXIF-rotated, scaled to ≤2400 px and re-encoded as JPEG by `lib/image.ts`, with a manual ↻ rotate per photo.
2. **Upload** (client → Supabase): a `submissions` row + `submission_pages` row are inserted with the teacher's session; the JPEG goes straight to Storage (RLS restricts the path prefix to the teacher's id).
3. **Transcribe** (`POST /api/transcribe`): verifies ownership, atomically consumes quota, downloads the image with the service role, normalises it with `sharp`, sends it to Claude with the handwriting prompt, parses the inline markers into `{text, uncertain, illegible_count}`, stores the transcription. Failure refunds the quota.
4. **Review** (`/submissions/[id]`): photo + text side by side (stacked on mobile). Uncertain characters are highlighted; tapping one offers alternatives. Inline editing remaps uncertain indices so highlights survive edits.
5. **Export**: clipboard, `.txt`, `.docx` per submission, one `.docx` per class (`/api/export/...`). Optional 繁/简 conversion with OpenCC happens only when the teacher picks it.
6. **Billing**: Stripe Checkout (subscription) → webhook updates `profiles.plan`. Free tier = `FREE_PAGES_PER_MONTH` pages, enforced in `consume_pages()`.
7. **Retention**: Vercel cron hits `/api/cron/cleanup` daily; images past `image_expires_at` are removed from Storage. Teachers can delete any submission (rows + images) instantly.

## Transcription output format

Claude is asked to return a single string with inline markers, which is far more reliable than asking a model to count character offsets:

- `[?]` — an illegible character
- `⟦字|候选1|候选2⟧` — a low-confidence character, followed by alternatives

`lib/markers.ts` turns this into the stored structure:

```json
{ "text": "我今天很高興[?]…", "uncertain": [{ "index": 5, "char": "興", "alternatives": ["兴", "與"] }], "illegible_count": 1 }
```

## File structure

```
app/
  layout.tsx, globals.css         root layout, i18n provider
  page.tsx                        home: big camera button, batch queue, recent work, usage
  login/page.tsx                  email magic link + Google
  auth/callback/route.ts          OAuth / magic-link code exchange
  auth/signout/route.ts
  classes/page.tsx                class list
  classes/[id]/page.tsx           students, class submissions, class export
  submissions/page.tsx            all submissions (incl. unassigned)
  submissions/[id]/page.tsx       review screen
  settings/page.tsx               language, script, retention, billing, delete data
  privacy/page.tsx
  api/transcribe/route.ts
  api/submissions/[id]/route.ts   DELETE (rows + images)
  api/export/submission/[id]/route.ts   ?format=txt|docx&script=
  api/export/class/[id]/route.ts        one .docx per class
  api/stripe/{checkout,portal,webhook}/route.ts
  api/cron/cleanup/route.ts
components/                       client components (capture queue, review editor, nav…)
lib/
  transcribe.ts                   Claude call + prompt (shared with the sample script)
  markers.ts                      marker parsing + index remapping (unit-tested)
  script.ts                       OpenCC 繁/简 conversion
  image.ts                        client-side rotate/compress
  docx.ts                         .docx builders
  i18n/                           dictionaries (zh-Hant, en; zh-Hans derived via OpenCC)
  supabase/{client,server,admin}.ts
  stripe.ts, env.ts, types.ts
proxy.ts                          Supabase session refresh + auth gate (Next 16 “proxy”)
supabase/migrations/0001_init.sql
scripts/transcribe-samples.ts     accuracy harness over /samples
```
