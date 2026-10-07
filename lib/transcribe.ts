import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { parseMarkedText } from "./markers";
import type { SubmissionKind, TranscriptionResult } from "./types";

/**
 * Shared by the API route and scripts/transcribe-samples.ts — keep it free of Next.js imports.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_EDGE = 2400;

export const SYSTEM_PROMPT = `你是一位專門協助中文老師辨認學生手寫字的轉錄員。You are a meticulous transcriber of Chinese students' handwriting for their teachers.

The teacher needs a FAITHFUL record of exactly what the student wrote, so they can mark it. Your job is transcription, never correction.

Rules — follow all of them:
1. Preserve the student's wording exactly. Do NOT fix 錯別字/错别字 (wrong characters), homophone mistakes, missing or extra characters, grammar, word order, or punctuation. If the student wrote a real but wrong character (e.g. 在 for 再), write that wrong character.
2. If a character is malformed and is not a real character (missing/extra strokes), write the real character it most closely resembles and mark it as low-confidence (rule 6) with the intended character(s) as alternatives.
3. Keep the script the student used. Do NOT convert between Traditional and Simplified. If the student mixes scripts, keep the mix.
4. Keep the layout: one output line per handwritten line, blank line between paragraphs, keep paragraph indentation as two full-width spaces "　　". On 原稿紙/grid paper, each row of the grid is one line. Vertical writing is read top-to-bottom, right-to-left, and output as horizontal lines (one per column).
5. Illegible characters: write [?] for each character you cannot read at all (one [?] per character).
6. Low-confidence characters: wrap them as ⟦字|候選1|候選2⟧ — the character you think is most likely first, then up to 3 plausible alternatives (visually or contextually similar). Use this whenever you are not confident; it is much better to flag than to guess silently. Do not wrap characters you are sure of.
7. Use full-width Chinese punctuation as written (，。、；：？！「」『』“”（）——……). If the student omitted punctuation, do not add it.
8. Omit anything clearly crossed out by the student. Include inserted characters (e.g. added with ^ or a caret) at their insertion point.
9. Ignore printed text (worksheet questions, headers, grid numbers) and the teacher's marks (red pen, ticks, scores). Include a title or name only if the student handwrote it.
10. If the page is rotated or upside down, read it in the correct orientation.
11. Output only the student's text in marked_text — no commentary. Put any brief observations for the teacher (e.g. "bottom of page cut off") in notes, otherwise an empty string.`;

const KIND_HINT: Record<SubmissionKind, string> = {
  essay: "This is an essay (作文).",
  dictation: "This is a dictation (默書/听写) exercise: words or sentences, possibly numbered. Keep numbering as written.",
  short_answer: "These are short answers on a worksheet. Transcribe only the student's handwritten answers, keeping question numbers the student wrote or that label each answer.",
  other: "",
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    marked_text: { type: "string", description: "The transcription with [?] and ⟦字|候選⟧ markers." },
    detected_script: { type: "string", enum: ["traditional", "simplified", "mixed", "unknown"] },
    notes: { type: "string" },
  },
  required: ["marked_text", "detected_script", "notes"],
  additionalProperties: false,
} as const;

export interface TranscribeOptions {
  kind?: SubmissionKind;
  model?: string;
  client?: Anthropic;
}

export interface TranscribeOutput extends TranscriptionResult {
  marked_text: string;
  detected_script: "traditional" | "simplified" | "mixed" | "unknown";
  notes: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export class TranscriptionRefusedError extends Error {}

/** Auto-rotate from EXIF, cap the long edge, re-encode as JPEG. */
export async function prepareImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function transcribeImage(image: Buffer, opts: TranscribeOptions = {}): Promise<TranscribeOutput> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const { data } = await prepareImage(image);
  const hint = KIND_HINT[opts.kind ?? "essay"];

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    // Server-side fallback: if a safety classifier declines, the API retries on Anthropic's
    // recommended fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } },
          { type: "text", text: `${hint}\nTranscribe the student's handwriting in this photo following the rules.`.trim() },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new TranscriptionRefusedError("The model declined to transcribe this image.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Transcription was cut off (max_tokens). Try splitting the page.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in model response.");

  let parsed: { marked_text: string; detected_script: TranscribeOutput["detected_script"]; notes: string };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const result = parseMarkedText(parsed.marked_text.replace(/\r\n/g, "\n").replace(/\s+$/, ""));
  return {
    ...result,
    marked_text: parsed.marked_text,
    detected_script: parsed.detected_script,
    notes: parsed.notes,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}
