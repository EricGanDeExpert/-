import * as OpenCC from "opencc-js";
import type { Script, ScriptView, UncertainChar } from "./types";

type Fn = (s: string) => string;
let toSimplified: Fn | null = null;
let toTraditional: Fn | null = null;

export function convertScript(text: string, target: Script): string {
  if (target === "simplified") {
    toSimplified ??= OpenCC.Converter({ from: "t", to: "cn" });
    return toSimplified(text);
  }
  toTraditional ??= OpenCC.Converter({ from: "cn", to: "t" });
  return toTraditional(text);
}

/** Convert text + uncertain list. Only called when the teacher explicitly asks. */
export function convertTranscription(
  text: string,
  uncertain: UncertainChar[],
  view: ScriptView,
): { text: string; uncertain: UncertainChar[] } {
  if (view === "original") return { text, uncertain };
  const converted = convertScript(text, view);
  // OpenCC conversions are character-for-character in practice; if a phrase mapping
  // changed the length we can't trust indices, so we drop highlights rather than misplace them.
  if (Array.from(converted).length !== Array.from(text).length) {
    return { text: converted, uncertain: [] };
  }
  return {
    text: converted,
    uncertain: uncertain.map((u) => ({
      ...u,
      char: Array.from(converted).slice(u.index, u.index + Array.from(u.char).length).join(""),
      alternatives: Array.from(new Set(u.alternatives.map((a) => convertScript(a, view)))),
    })),
  };
}

export function scriptForLocale(locale: string | null | undefined): Script {
  if (!locale) return "traditional";
  const l = locale.toLowerCase();
  if (l.includes("hans") || l === "zh-cn" || l === "zh-sg" || l.startsWith("zh-cn")) return "simplified";
  return "traditional";
}
