import { NextResponse } from "next/server";
import { z } from "zod";
import { addFact, listFacts } from "@/lib/services/facts";
import { parseBody } from "@/lib/http";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json({ facts: await listFacts({ includeReplaced: all }) });
}

const Body = z.object({ text: z.string().trim().min(1), shiftId: z.string().optional() });

/** Manager adds a standalone fact. Source "correction": it comes from the manager, not the seed. */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  return NextResponse.json({ fact: await addFact(body.text, "correction", body.shiftId) });
}
