import "server-only";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { ILLEGIBLE } from "./markers";
import type { ScriptView, UncertainChar } from "./types";

export interface ExportEntry {
  heading: string;
  meta: string;
  pages: { text: string; uncertain: UncertainChar[] }[];
}

function fontFor(script: ScriptView) {
  const eastAsia = script === "simplified" ? "SimSun" : "PMingLiU";
  return { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia };
}

/** One paragraph per line; uncertain characters highlighted yellow, [?] in red. */
function textParagraphs(text: string, uncertain: UncertainChar[], script: ScriptView): Paragraph[] {
  const font = fontFor(script);
  const unsure = new Set<number>();
  for (const u of uncertain) for (let k = 0; k < Array.from(u.char).length; k++) unsure.add(u.index + k);

  const chars = Array.from(text);
  const paragraphs: Paragraph[] = [];
  let runs: TextRun[] = [];
  let buf = "";
  let bufUnsure = false;
  const flush = () => {
    if (!buf) return;
    const parts = bufUnsure ? [buf] : buf.split(ILLEGIBLE);
    parts.forEach((p, i) => {
      if (p) runs.push(new TextRun({ text: p, font, size: 28, highlight: bufUnsure ? "yellow" : undefined }));
      if (!bufUnsure && i < parts.length - 1) runs.push(new TextRun({ text: ILLEGIBLE, font, size: 28, color: "B91C1C" }));
    });
    buf = "";
  };

  chars.forEach((c, i) => {
    if (c === "\n") {
      flush();
      paragraphs.push(new Paragraph({ children: runs, spacing: { line: 400 } }));
      runs = [];
      return;
    }
    const isUnsure = unsure.has(i);
    if (isUnsure !== bufUnsure) {
      flush();
      bufUnsure = isUnsure;
    }
    buf += c;
  });
  flush();
  paragraphs.push(new Paragraph({ children: runs, spacing: { line: 400 } }));
  return paragraphs;
}

export async function buildDocx(entries: ExportEntry[], script: ScriptView, docTitle?: string): Promise<Buffer> {
  const font = fontFor(script);
  const children: Paragraph[] = [];
  if (docTitle) {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: docTitle, font })] }));
  }
  entries.forEach((e, i) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: i > 0,
        children: [new TextRun({ text: e.heading, font })],
      }),
      new Paragraph({ children: [new TextRun({ text: e.meta, font, size: 20, color: "78716C" })], spacing: { after: 240 } }),
    );
    e.pages.forEach((p, j) => {
      if (j > 0) children.push(new Paragraph({ children: [new TextRun({ text: "— — —", color: "A8A29E" })], alignment: AlignmentType.CENTER }));
      children.push(...textParagraphs(p.text, p.uncertain, script));
    });
  });
  const doc = new Document({
    creator: "字清 Ziqing",
    title: docTitle ?? entries[0]?.heading ?? "字清",
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
