/**
 * Accuracy harness: transcribes every image in /samples and prints the results.
 *
 *   npm run test:samples                      # all images
 *   npm run test:samples -- essay1.jpg        # specific files
 *   npm run test:samples -- --kind dictation  # hint the submission type
 *   npm run test:samples -- --model claude-sonnet-5-5
 *
 * If samples/<name>.txt exists (the correct transcription), a character error rate is
 * reported. Results are written to samples/results/<name>.json for side-by-side diffs.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { transcribeImage, DEFAULT_MODEL } from "../lib/transcribe";
import { toMarkedText } from "../lib/markers";
import type { SubmissionKind } from "../lib/types";

loadEnv({ path: ".env.local", override: true });

const SAMPLES = path.resolve(process.cwd(), "samples");
const RESULTS = path.join(SAMPLES, "results");
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;

function parseArgs(argv: string[]) {
  const files: string[] = [];
  let kind: SubmissionKind = "essay";
  let model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kind") kind = argv[++i] as SubmissionKind;
    else if (argv[i] === "--model") model = argv[++i];
    else files.push(argv[i]);
  }
  return { files, kind, model };
}

/** Levenshtein distance over code points (ignoring whitespace), for character error rate. */
function cer(hyp: string, ref: string): number {
  const a = Array.from(hyp.replace(/\s/g, ""));
  const b = Array.from(ref.replace(/\s/g, ""));
  if (b.length === 0) return a.length === 0 ? 0 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] / b.length;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (put it in .env.local).");
    process.exit(1);
  }
  const { files, kind, model } = parseArgs(process.argv.slice(2));
  const all = existsSync(SAMPLES) ? (await readdir(SAMPLES)).filter((f) => IMAGE_EXT.test(f)).sort() : [];
  const targets = files.length ? files.map((f) => path.basename(f)) : all;
  if (targets.length === 0) {
    console.error("No images found. Put photos of handwriting in /samples (jpg/png/webp).");
    process.exit(1);
  }
  await mkdir(RESULTS, { recursive: true });

  const summary: { file: string; chars: number; uncertain: number; illegible: number; cer?: number; seconds: number }[] = [];
  for (const file of targets) {
    const started = Date.now();
    process.stdout.write(`\n━━━ ${file} (${model}, ${kind}) ━━━\n`);
    try {
      const out = await transcribeImage(await readFile(path.join(SAMPLES, file)), { kind, model });
      const seconds = (Date.now() - started) / 1000;
      console.log(out.text);
      console.log("\n— marked —");
      console.log(toMarkedText(out.text, out.uncertain));
      if (out.uncertain.length) {
        console.log("\n— uncertain —");
        for (const u of out.uncertain) console.log(`  #${u.index} ${u.char} → ${u.alternatives.join(" / ") || "(none)"}`);
      }
      if (out.notes) console.log(`\nnotes: ${out.notes}`);
      const refPath = path.join(SAMPLES, file.replace(IMAGE_EXT, ".txt"));
      const ref = existsSync(refPath) ? await readFile(refPath, "utf8") : null;
      const rate = ref !== null ? cer(out.text, ref) : undefined;
      console.log(
        `\nchars=${Array.from(out.text.replace(/\s/g, "")).length} uncertain=${out.uncertain.length} illegible=${out.illegible_count} script=${out.detected_script} tokens=${out.input_tokens}/${out.output_tokens} ${seconds.toFixed(1)}s` +
          (rate !== undefined ? ` CER=${(rate * 100).toFixed(2)}%` : ""),
      );
      await writeFile(path.join(RESULTS, `${file}.json`), JSON.stringify({ file, model, kind, ...out, cer: rate }, null, 2));
      summary.push({ file, chars: Array.from(out.text).length, uncertain: out.uncertain.length, illegible: out.illegible_count, cer: rate, seconds });
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
    }
  }

  console.log("\n━━━ summary ━━━");
  console.table(
    summary.map((s) => ({ ...s, cer: s.cer === undefined ? "—" : `${(s.cer * 100).toFixed(2)}%`, seconds: s.seconds.toFixed(1) })),
  );
}

main();
