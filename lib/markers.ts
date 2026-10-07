import type { TranscriptionResult, UncertainChar } from "./types";

/**
 * The model writes uncertain characters inline as ⟦字|候选1|候选2⟧ and illegible
 * characters as [?]. Inline markers are much more reliable than asking a model to
 * count character offsets; we convert them to code-point indices here.
 */
export const OPEN = "⟦";
export const CLOSE = "⟧";
export const ILLEGIBLE = "[?]";

const ILLEGIBLE_VARIANTS = /［[?？]］|\[[？]\]|【[?？]】/g;

export function normalizeIllegible(s: string): string {
  return s.replace(ILLEGIBLE_VARIANTS, ILLEGIBLE);
}

export function countIllegible(text: string): number {
  return text.split(ILLEGIBLE).length - 1;
}

export function parseMarkedText(marked: string): TranscriptionResult {
  const src = Array.from(normalizeIllegible(marked));
  const out: string[] = [];
  const uncertain: UncertainChar[] = [];

  for (let i = 0; i < src.length; i++) {
    if (src[i] !== OPEN) {
      out.push(src[i]);
      continue;
    }
    const close = src.indexOf(CLOSE, i + 1);
    const nextOpen = src.indexOf(OPEN, i + 1);
    if (close === -1 || (nextOpen !== -1 && nextOpen < close)) {
      // Malformed marker: drop the stray bracket, keep the content.
      continue;
    }
    const parts = src.slice(i + 1, close).join("").split("|");
    const char = parts[0].trim();
    const alternatives = Array.from(
      new Set(parts.slice(1).map((p) => p.trim()).filter((p) => p && p !== char)),
    );
    if (char) {
      uncertain.push({ index: out.length, char, alternatives });
      out.push(...Array.from(char));
    }
    i = close;
  }

  const text = out.join("");
  return { text, uncertain, illegible_count: countIllegible(text) };
}

/** Re-insert markers (useful for debugging and for the sample harness output). */
export function toMarkedText(text: string, uncertain: UncertainChar[]): string {
  const chars = Array.from(text);
  const sorted = [...uncertain].sort((a, b) => b.index - a.index);
  for (const u of sorted) {
    const len = Array.from(u.char).length;
    if (chars.slice(u.index, u.index + len).join("") !== u.char) continue;
    chars.splice(u.index, len, `${OPEN}${[u.char, ...u.alternatives].join("|")}${CLOSE}`);
  }
  return chars.join("");
}

/**
 * After a free-form edit, shift uncertain indices so highlights stay on the right
 * characters. Anything inside the edited span is dropped (the teacher has looked at it).
 */
export function remapUncertain(
  oldText: string,
  newText: string,
  uncertain: UncertainChar[],
): UncertainChar[] {
  const a = Array.from(oldText);
  const b = Array.from(newText);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const editEndOld = a.length - suffix;
  const delta = b.length - a.length;

  const result: UncertainChar[] = [];
  for (const u of uncertain) {
    const end = u.index + Array.from(u.char).length;
    if (end <= prefix) result.push(u);
    else if (u.index >= editEndOld) result.push({ ...u, index: u.index + delta });
  }
  return result.filter((u) => Array.from(newText).slice(u.index, u.index + Array.from(u.char).length).join("") === u.char);
}

/** Replace the uncertain character at `index` with `replacement` and resolve it. */
export function resolveUncertain(
  text: string,
  uncertain: UncertainChar[],
  index: number,
  replacement: string,
): { text: string; uncertain: UncertainChar[] } {
  const target = uncertain.find((u) => u.index === index);
  if (!target) return { text, uncertain };
  const chars = Array.from(text);
  const oldLen = Array.from(target.char).length;
  const newLen = Array.from(replacement).length;
  chars.splice(index, oldLen, ...Array.from(replacement));
  const delta = newLen - oldLen;
  return {
    text: chars.join(""),
    uncertain: uncertain
      .filter((u) => u.index !== index)
      .map((u) => (u.index > index ? { ...u, index: u.index + delta } : u)),
  };
}
