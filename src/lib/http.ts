import { NextResponse } from "next/server";
import { z } from "zod";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | Response> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

export function serverError(err: unknown) {
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
}

/** Dev helpers (reset, close-shift, restore-fact) never run on the live Vercel site.
 *  A local production build can opt in with ALLOW_RESET=1. */
export function devToolsAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_RESET === "1";
}
