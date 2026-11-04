import { NextResponse } from "next/server";
import { z } from "zod";
import { handleReport } from "@/lib/agent/run";
import { parseBody, serverError } from "@/lib/http";

const Body = z.object({
  text: z.string().min(1),
  shiftId: z.string().min(1),
  source: z.enum(["radio", "text"]).default("text"),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  try {
    return NextResponse.json(await handleReport(body));
  } catch (err) {
    return serverError(err);
  }
}
