// Speech in and out for the radio page. Server side only: OPENAI_API_KEY never
// reaches the browser. These calls go straight to OpenAI, not through Mubit,
// so they never touch the Spring It classifier's training task.

const OPENAI = "https://api.openai.com/v1";

export const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
export const JUDGE_MODEL = "gpt-4.1-mini";
export const SPEECH_MODEL = "gpt-4o-mini-tts";
export const SPEECH_VOICE = "ash";

const SPEECH_STYLE =
  "Calm building control-room voice on a two-way radio. Clear, brisk, even pace, no emotion.";

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new SpeechUnavailable("OPENAI_API_KEY is not set");
  return k;
}

export class SpeechUnavailable extends Error {}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
}

export type Heard = { engine: "openai" | "elevenlabs"; text: string; confidence: number | null };

/** Mean token probability (0..1) from logprobs, or null when none came back. */
export function meanProb(logprobs: number[]) {
  if (!logprobs.length) return null;
  return logprobs.reduce((n, lp) => n + Math.exp(Math.min(0, lp)), 0) / logprobs.length;
}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<Heard> {
  const form = new FormData();
  const ext = audio.type.includes("mpeg") ? "mp3" : audio.type.includes("webm") ? "webm" : "wav";
  form.append("file", audio, `report.${ext}`);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("include[]", "logprobs");
  // No vocabulary prompt: on a quiet or noisy clip the model echoes it back as if
  // it were heard (it once turned radio hiss into "... hand over" and handed over a shift).
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}` },
    body: form,
    signal,
  });
  if (!res.ok) await fail(res, "Transcription");
  const json = (await res.json()) as { text?: string; logprobs?: { logprob: number }[] };
  return {
    engine: "openai",
    text: (json.text ?? "").trim(),
    confidence: meanProb((json.logprobs ?? []).map((l) => l.logprob)),
  };
}

/** Pick between two transcripts with a direct OpenAI call (never Mubit, never the
 *  Spring It classifier, so the training task stays clean). Returns 0 or 1. */
export async function judge(a: string, b: string, signal?: AbortSignal): Promise<0 | 1> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      max_tokens: 1,
      messages: [
        {
          role: "system",
          content:
            "Two speech-to-text engines transcribed the same clip from a building concierge's two-way radio. Answer with the single digit 1 or 2: which transcript is more likely what was actually said?",
        },
        { role: "user", content: `1: ${a}\n2: ${b}` },
      ],
    }),
    signal,
  });
  if (!res.ok) await fail(res, "Judge");
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim().startsWith("2") ? 1 : 0;
}

export async function speak(text: string): Promise<ArrayBuffer> {
  const res = await fetch(`${OPENAI}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      input: text,
      instructions: SPEECH_STYLE,
      response_format: "mp3",
    }),
  });
  if (!res.ok) await fail(res, "Speech");
  return res.arrayBuffer();
}
