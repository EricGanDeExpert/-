# 字清 Ziqing

Helps Chinese-language teachers read students' messy handwriting. Photograph essays (作文), dictations (默書/听写) or short answers; get a faithful, editable transcription with uncertain characters highlighted.

- **Faithful transcription**: wrong characters (錯別字) and grammar are kept as written; illegible characters become `[?]`; low-confidence characters are highlighted with alternatives.
- **Batch capture**: snap or pick a whole class stack, assign each photo to a student (or leave unassigned), auto-rotate + compress before upload.
- **Review**: photo and text side by side (stacked on phones), tap highlights to choose alternatives, edit inline.
- **Export**: copy, `.txt`, `.docx`, or a whole class as one `.docx`. Optional 繁 ⇄ 简 conversion only when you ask for it.
- **Billing**: free 20 pages/month; Pro US$5/month (≈ HK$39 / ¥35) unlimited, enforced server-side.
- **Privacy**: photos auto-delete after 30 days (configurable per teacher), instant delete, no other use of student data.
- **UI**: 繁體中文 / 简体中文 / English.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind v4 · Supabase (auth, Postgres, storage) · Anthropic Claude (vision) · Stripe · Vercel.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, request flow and file layout.

---

## Setup

### 0. Prerequisites

Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
```

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Database** – open the SQL editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) (or `supabase link && supabase db push` with the CLI). This creates the tables, row-level security, quota functions, retention triggers and the private `submissions` storage bucket.
3. **Keys** – *Project Settings → API*: copy the Project URL, the anon/publishable key and the service-role key into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The service-role key is only used server-side.
4. **Auth → URL configuration** – set *Site URL* to your app URL and add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback` to *Redirect URLs*.
5. **Email sign-in** – enabled by default (magic link). For production, configure a custom SMTP provider under *Auth → SMTP* (Supabase's built-in mailer is rate-limited).
6. **Google sign-in** – *Auth → Providers → Google*: enable, then create an OAuth client in Google Cloud Console (*APIs & Services → Credentials → OAuth client ID → Web application*) with the authorised redirect URI shown in the Supabase Google provider panel (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`). Paste the client ID/secret back into Supabase.

### 2. Anthropic

Create an API key at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`; override with `ANTHROPIC_MODEL` (e.g. to compare accuracy/cost with `claude-sonnet-5-5`). Requests opt into Anthropic's server-side fallback (`fallbacks: "default"`), so if a safety classifier ever declines an image the API retries on a fallback model inside the same call.

### 3. Stripe

1. In the Stripe dashboard create a product **字清 Pro** with a **recurring monthly price of US$5**. To show local prices at checkout, add *currency options* on the same price: HKD 39 and CNY 35. Copy the price id into `STRIPE_PRICE_ID_PRO`.
2. Copy your secret key into `STRIPE_SECRET_KEY`.
3. **Webhook** – add an endpoint `https://YOUR-DOMAIN/api/stripe/webhook` listening for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused` and `customer.subscription.resumed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the `whsec_…` it prints.
4. **Customer portal** – enable it under *Settings → Billing → Customer portal* (used by "Manage subscription").

The free limit (`FREE_PAGES_PER_MONTH`, default 20) is enforced in Postgres by `consume_pages()`, an atomic check-and-increment called by the transcription route; failed transcriptions are refunded.

### 4. Run

```bash
npm run dev            # http://localhost:3000
npm run typecheck
npm run test:unit      # marker parsing / index remapping tests
```

On a phone on the same network, open `http://YOUR-LAN-IP:3000` (camera capture needs HTTPS outside localhost — use the Vercel preview or a tunnel such as `cloudflared` for real-device testing).

### 5. Deploy to Vercel

1. Import the repo in Vercel and add every variable from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the production URL).
2. Set `CRON_SECRET` to a long random string. `vercel.json` schedules `/api/cron/cleanup` daily; Vercel sends `Authorization: Bearer $CRON_SECRET`, and the route deletes photos past their retention date.
3. Add the production callback URL to Supabase and the webhook URL to Stripe (steps above).

---

## Testing transcription accuracy

Put photos of handwriting in [`/samples`](samples/README.md) and run:

```bash
npm run test:samples
npm run test:samples -- essay1.jpg --kind dictation
npm run test:samples -- --model claude-sonnet-5-5
```

It prints each transcription (plain and with inline `⟦字|候選⟧` markers), the uncertain characters with alternatives, token usage and timing. If `samples/<name>.txt` holds the correct text, it also reports a character error rate. Full results go to `samples/results/*.json`. Sample images and results are git-ignored so student work is never committed.

The prompt lives in [`lib/transcribe.ts`](lib/transcribe.ts) (`SYSTEM_PROMPT`) and is shared by the app and the harness, so prompt changes can be measured before shipping.

---

## Notes and decisions

- **Script handling**: Claude is told never to convert scripts; the transcription is always what the student wrote. The 原文 / 繁 / 简 toggle and export option convert with OpenCC only on request. Each teacher's default (`preferred_script`) is seeded from the browser locale at first sign-in (HK/TW → Traditional, CN → Simplified) and can be changed in Settings.
- **Uncertainty markers**: rather than asking the model for character offsets (unreliable), it writes `⟦字|alt1|alt2⟧` inline and `lib/markers.ts` converts that to `{ text, uncertain: [{index, char, alternatives}], illegible_count }` (code-point indices). Edits remap the indices so highlights stay put.
- **Original output is kept**: `transcriptions.raw_text` holds the model's text untouched, so teacher edits can later be compared against it to measure real-world accuracy.
- **Pages**: each photo is one `submission_page`; the schema supports multi-page submissions, the MVP UI creates one page per photo.
- **Phase 2** (rubric marking, error detection, school licenses) has hooks in the schema — see `docs/ARCHITECTURE.md`.
