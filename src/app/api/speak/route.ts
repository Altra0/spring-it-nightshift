import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, serverError } from "@/lib/http";
import { SpeechUnavailable, speak } from "@/lib/radio/openai";

const Body = z.object({ text: z.string().min(1).max(600) });

// { text } -> audio/mpeg. 503 when speech is unavailable, so the page falls back
// to the browser's own voice.
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  try {
    const audio = await speak(body.text);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof SpeechUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return serverError(err);
  }
}
