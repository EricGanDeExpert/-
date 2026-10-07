-- 字清 (Ziqing) — initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.
--
-- Hierarchy:  teacher (auth.users / profiles)
--               └─ classes ─ students
--               └─ submissions (optionally linked to a class and/or student)
--                    └─ submission_pages (one photo each)
--                         └─ transcriptions (faithful text, one current row per page)
--
-- Phase 2 hooks (not built yet):
--   * organizations / organization_members  → school & team licenses
--   * submissions.organization_id, profiles.organization_id
--   * transcriptions stay faithful; error detection & rubric marking will live in
--     their own tables (text_annotations, rubrics, assessments) that reference
--     transcriptions/submissions, so the student's original text is never mutated.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizations (Phase 2: school/team licenses). Created now so FKs exist.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'school')),
  seat_limit int,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'teacher' check (role in ('owner', 'admin', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Profiles: one row per teacher, created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  -- UI language: zh-Hant | zh-Hans | en
  ui_locale text not null default 'zh-Hant' check (ui_locale in ('zh-Hant', 'zh-Hans', 'en')),
  -- Preferred output script for conversion/export. Transcription itself is always as-written.
  preferred_script text not null default 'traditional' check (preferred_script in ('traditional', 'simplified')),
  -- Days to keep uploaded images before automatic deletion (text is kept until deleted).
  retention_days int not null default 30 check (retention_days between 1 and 365),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Classes & students
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade text,
  created_at timestamptz not null default now()
);
create index classes_teacher_idx on public.classes(teacher_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  student_number text,
  created_at timestamptz not null default now()
);
create index students_class_idx on public.students(class_id);

-- ---------------------------------------------------------------------------
-- Submissions: one piece of student work (may span several photos/pages).
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  title text,
  kind text not null default 'essay' check (kind in ('essay', 'dictation', 'short_answer', 'other')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index submissions_teacher_idx on public.submissions(teacher_id, created_at desc);
create index submissions_class_idx on public.submissions(class_id);
create index submissions_student_idx on public.submissions(student_id);

create table public.submission_pages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  page_number int not null default 1,
  -- Storage object path in the private "submissions" bucket: {teacher_id}/{submission_id}/{page_id}.jpg
  image_path text,
  image_expires_at timestamptz not null,
  image_deleted_at timestamptz,
  width int,
  height int,
  created_at timestamptz not null default now(),
  unique (submission_id, page_number)
);
create index submission_pages_expiry_idx on public.submission_pages(image_expires_at) where image_deleted_at is null;

-- ---------------------------------------------------------------------------
-- Transcriptions: faithful text of what the student wrote.
--   text       – current text (teacher edits land here)
--   raw_text   – the model's original output, kept for accuracy comparison
--   uncertain  – [{index, char, alternatives}] indices are Unicode code points into `text`
-- ---------------------------------------------------------------------------
create table public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null unique references public.submission_pages(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  raw_text text not null default '',
  uncertain jsonb not null default '[]'::jsonb,
  illegible_count int not null default 0,
  detected_script text check (detected_script in ('traditional', 'simplified', 'mixed', 'unknown')),
  model text,
  input_tokens int,
  output_tokens int,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transcriptions_submission_idx on public.transcriptions(submission_id);

-- ---------------------------------------------------------------------------
-- Usage: pages transcribed per teacher per calendar month (UTC).
-- ---------------------------------------------------------------------------
create table public.usage_counters (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  pages_used int not null default 0,
  primary key (teacher_id, period)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions
  for each row execute function public.touch_updated_at();
create trigger transcriptions_touch before update on public.transcriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap on sign-up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic quota check + increment. Called server-side only (service role).
-- Returns the new pages_used, or -1 if the free limit would be exceeded.
-- ---------------------------------------------------------------------------
create or replace function public.consume_pages(p_teacher uuid, p_pages int, p_free_limit int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_plan text;
  v_used int;
begin
  select plan into v_plan from public.profiles where id = p_teacher;

  insert into public.usage_counters (teacher_id, period, pages_used)
  values (p_teacher, v_period, 0)
  on conflict (teacher_id, period) do nothing;

  select pages_used into v_used from public.usage_counters
  where teacher_id = p_teacher and period = v_period
  for update;

  if coalesce(v_plan, 'free') <> 'pro' and v_used + p_pages > p_free_limit then
    return -1;
  end if;

  update public.usage_counters set pages_used = pages_used + p_pages
  where teacher_id = p_teacher and period = v_period;
  return v_used + p_pages;
end $$;

-- Give pages back when a transcription fails.
create or replace function public.refund_pages(p_teacher uuid, p_pages int)
returns void
language sql security definer set search_path = public as $$
  update public.usage_counters
  set pages_used = greatest(0, pages_used - p_pages)
  where teacher_id = p_teacher and period = to_char(now() at time zone 'utc', 'YYYY-MM');
$$;

revoke execute on function public.consume_pages(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.refund_pages(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: teachers only ever see their own rows.
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_pages enable row level security;
alter table public.transcriptions enable row level security;
alter table public.usage_counters enable row level security;

create policy "members read their orgs" on public.organizations for select
  using (exists (select 1 from public.organization_members m where m.organization_id = id and m.user_id = auth.uid()));
create policy "members read own membership" on public.organization_members for select
  using (user_id = auth.uid());

create policy "own profile read" on public.profiles for select using (id = auth.uid());
-- Billing columns are only written by the service role (webhook); see column grants below.
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, ui_locale, preferred_script, retention_days) on public.profiles to authenticated;

create policy "own classes" on public.classes for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "own students" on public.students for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "own submissions" on public.submissions for all
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and (class_id is null or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
    and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.teacher_id = auth.uid()))
  );

create policy "own pages" on public.submission_pages for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and exists (select 1 from public.submissions s where s.id = submission_id and s.teacher_id = auth.uid()));

-- Teachers may read and edit (text/uncertain) their transcriptions; inserts come from the server.
create policy "own transcriptions read" on public.transcriptions for select using (teacher_id = auth.uid());
create policy "own transcriptions update" on public.transcriptions for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "own transcriptions delete" on public.transcriptions for delete using (teacher_id = auth.uid());
revoke update on public.transcriptions from authenticated;
grant update (text, uncertain, illegible_count, edited_at) on public.transcriptions to authenticated;

create policy "own usage read" on public.usage_counters for select using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects namespaced by teacher id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "teacher uploads own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "teacher reads own folder" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "teacher deletes own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
