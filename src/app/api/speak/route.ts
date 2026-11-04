import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, serverError } from "@/lib/http";
import { hasElevenLabsKey, speak as elevenSpeak } from "@/lib/radio/elevenlabs";
import { SpeechUnavailable, speak as openaiSpeak } from "@/lib/radio/openai";

const Body = z.object({ text: z.string().min(1).max(600) });

// { text } -> audio/mpeg. ElevenLabs when ELEVENLABS_API_KEY is set (same as
// /api/transcribe), otherwise OpenAI. 503 when speech is unavailable, so the page
// falls back to the browser's own voice (speaker mode only).
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  try {
    const audio = await (hasElevenLabsKey() ? elevenSpeak : openaiSpeak)(body.text);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof SpeechUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return serverError(err);
  }
}
