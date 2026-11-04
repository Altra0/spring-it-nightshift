// Speech to text for the radio page via ElevenLabs Scribe. Server side only:
// ELEVENLABS_API_KEY never reaches the browser. Like the OpenAI speech calls, this
// goes straight to the provider, not through Mubit, so it never touches the
// Spring It classifier's training task.

import { SpeechUnavailable } from "@/lib/radio/openai";

const ELEVENLABS = "https://api.elevenlabs.io/v1";

export const TRANSCRIBE_MODEL = "scribe_v2";

export function hasElevenLabsKey() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new SpeechUnavailable("ELEVENLABS_API_KEY is not set");
  return k;
}

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("mpeg") ? "mp3" : audio.type.includes("webm") ? "webm" : "wav";
  form.append("file", audio, `report.${ext}`);
  form.append("model_id", TRANSCRIBE_MODEL);
  form.append("language_code", "en");
  // Scribe tags non-speech by default ("(static)", "(beep)"). Radio clips are full of
  // hiss and squelch tails, and those tags would land in the report text as words.
  form.append("tag_audio_events", "false");
  // No keyterms: same reason as the OpenAI path had no vocabulary prompt. On a quiet
  // or noisy clip a vocabulary hint can be "heard" in the hiss.
  const res = await fetch(`${ELEVENLABS}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

// Text to speech for replies. Flash is ElevenLabs' low-latency model, so the reply
// starts quickly after the report. "George" is a calm British premade voice; set
// ELEVENLABS_VOICE_ID to use another.
export const SPEECH_MODEL = "eleven_flash_v2_5";
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export async function speak(text: string): Promise<ArrayBuffer> {
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const res = await fetch(`${ELEVENLABS}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: SPEECH_MODEL, language_code: "en" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Speech failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.arrayBuffer();
}
