// ElevenLabs Scribe, the second transcription engine. Server side only; the key
// never reaches the browser. Without ELEVENLABS_API_KEY the radio uses OpenAI alone.

import { meanProb, type Heard } from "./openai";

export const SCRIBE_MODEL = "scribe_v2";

export const elevenLabsEnabled = () => !!process.env.ELEVENLABS_API_KEY;

export async function transcribeScribe(audio: Blob, signal?: AbortSignal): Promise<Heard> {
  const form = new FormData();
  form.append("file", audio, "report.wav");
  form.append("model_id", SCRIBE_MODEL);
  form.append("language_code", "en");
  form.append("tag_audio_events", "false");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: form,
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Scribe failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string; words?: { type?: string; logprob?: number }[] };
  const words = (json.words ?? []).filter((w) => w.type === "word" && typeof w.logprob === "number");
  return { engine: "elevenlabs", text: (json.text ?? "").trim(), confidence: meanProb(words.map((w) => w.logprob!)) };
}
