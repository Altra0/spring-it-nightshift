import { NextResponse } from "next/server";
import { bad, serverError } from "@/lib/http";
import { SpeechUnavailable } from "@/lib/radio/openai";
import { pickTranscript } from "@/lib/radio/pick";

const MAX_BYTES = 10 * 1024 * 1024;

// multipart/form-data with `audio` (a WAV or webm blob) -> { text, engine, alternatives }
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return bad("audio: expected a non-empty file");
  if (audio.size > MAX_BYTES) return bad("audio: larger than 10 MB");
  try {
    return NextResponse.json(await pickTranscript(audio));
  } catch (err) {
    if (err instanceof SpeechUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return serverError(err);
  }
}
