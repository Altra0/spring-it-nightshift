// Speech in and out for the radio page. Server side only: OPENAI_API_KEY never
// reaches the browser. These calls go straight to OpenAI, not through Mubit,
// so they never touch the Spring It classifier's training task.

const OPENAI = "https://api.openai.com/v1";

export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
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

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("mpeg") ? "mp3" : audio.type.includes("webm") ? "webm" : "wav";
  form.append("file", audio, `report.${ext}`);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", "en");
  // No vocabulary prompt: on a quiet or noisy clip the model echoes it back as if
  // it were heard (it once turned radio hiss into "... hand over" and handed over a shift).
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}` },
    body: form,
  });
  if (!res.ok) await fail(res, "Transcription");
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
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
