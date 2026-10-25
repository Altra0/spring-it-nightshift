// Two engines hear every clip; this decides which transcript Spring It gets.
//  - one fails or is empty: use the other
//  - they agree closely: use OpenAI
//  - they differ: higher mean word confidence wins, or a quick judge call when
//    confidence isn't available from both

import { elevenLabsEnabled, transcribeScribe } from "./elevenlabs";
import { judge, transcribe, type Heard } from "./openai";

const ENGINE_TIMEOUT_MS = 10_000;
const JUDGE_TIMEOUT_MS = 4_000;
const AGREE = 0.85;

export type Picked = { text: string; engine: Heard["engine"]; alternatives: { engine: Heard["engine"]; text: string }[] };

const words = (t: string) =>
  t.toLowerCase().replace(/['’]s\b/g, " is").replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

/** Word-level similarity, 0..1 (1 - edit distance / longer length). */
export function similarity(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.length && !y.length) return 1;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}

export async function pickTranscript(audio: Blob): Promise<Picked> {
  const engines = [transcribe(audio, AbortSignal.timeout(ENGINE_TIMEOUT_MS))];
  if (elevenLabsEnabled()) engines.push(transcribeScribe(audio, AbortSignal.timeout(ENGINE_TIMEOUT_MS)));
  const settled = await Promise.allSettled(engines);
  const heard = settled.flatMap((r) => (r.status === "fulfilled" && r.value.text ? [r.value] : []));
  settled.forEach((r) => r.status === "rejected" && console.error("[transcribe]", r.reason));

  const alternatives = heard.map(({ engine, text }) => ({ engine, text }));
  if (heard.length === 0) {
    const failed = settled.find((r) => r.status === "rejected");
    if (failed && settled.every((r) => r.status === "rejected")) throw (failed as PromiseRejectedResult).reason;
    return { text: "", engine: "openai", alternatives };
  }
  if (heard.length === 1) return { text: heard[0].text, engine: heard[0].engine, alternatives };

  const [openai, scribe] = heard;
  let winner = openai;
  if (similarity(openai.text, scribe.text) < AGREE) {
    if (openai.confidence !== null && scribe.confidence !== null) {
      winner = scribe.confidence > openai.confidence ? scribe : openai;
    } else {
      winner = (await judge(openai.text, scribe.text, AbortSignal.timeout(JUDGE_TIMEOUT_MS)).catch(() => 0)) === 1 ? scribe : openai;
    }
  }
  return { text: winner.text, engine: winner.engine, alternatives };
}
