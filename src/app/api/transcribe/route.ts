import { NextResponse } from "next/server";
import { bad, serverError } from "@/lib/http";
import { hasElevenLabsKey, transcribe as scribe } from "@/lib/radio/elevenlabs";
import { SpeechUnavailable, transcribe as openaiTranscribe } from "@/lib/radio/openai";

const MAX_BYTES = 10 * 1024 * 1024;

// multipart/form-data with `audio` (a WAV or webm blob) -> { text }
// ElevenLabs Scribe when ELEVENLABS_API_KEY is set, otherwise OpenAI as before.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return bad("audio: expected a non-empty file");
  if (audio.size > MAX_BYTES) return bad("audio: larger than 10 MB");
  try {
    const transcribe = hasElevenLabsKey() ? scribe : openaiTranscribe;
    return NextResponse.json({ text: await transcribe(audio) });
  } catch (err) {
    if (err instanceof SpeechUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return serverError(err);
  }
}
