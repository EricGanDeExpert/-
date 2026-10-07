export type Script = "traditional" | "simplified";
export type ScriptView = "original" | Script;
export type Locale = "zh-Hant" | "zh-Hans" | "en";
export type SubmissionKind = "essay" | "dictation" | "short_answer" | "other";
export type SubmissionStatus = "pending" | "processing" | "done" | "error";

export interface UncertainChar {
  /** Unicode code-point index into `text`. */
  index: number;
  char: string;
  alternatives: string[];
}

export interface TranscriptionResult {
  text: string;
  uncertain: UncertainChar[];
  illegible_count: number;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  ui_locale: Locale;
  preferred_script: Script;
  retention_days: number;
  plan: "free" | "pro";
  subscription_status: string | null;
  current_period_end: string | null;
  whop_membership_id: string | null;
}

export interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  created_at: string;
}

export interface StudentRow {
  id: string;
  class_id: string;
  name: string;
  student_number: string | null;
}

export interface SubmissionRow {
  id: string;
  class_id: string | null;
  student_id: string | null;
  title: string | null;
  kind: SubmissionKind;
  status: SubmissionStatus;
  error_message: string | null;
  created_at: string;
}

export interface PageRow {
  id: string;
  submission_id: string;
  page_number: number;
  image_path: string | null;
  image_expires_at: string;
  image_deleted_at: string | null;
}

export interface TranscriptionRow {
  id: string;
  page_id: string;
  submission_id: string;
  text: string;
  raw_text: string;
  uncertain: UncertainChar[];
  illegible_count: number;
  edited_at: string | null;
}
