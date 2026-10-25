import { NextResponse } from "next/server";
import { z } from "zod";
import { replayCorrection } from "@/lib/agent/replay";
import { bad, parseBody, serverError } from "@/lib/http";

const Body = z.object({ correctionId: z.string().min(1) });

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  try {
    const result = await replayCorrection(body.correctionId);
    if (!result) return bad("correction not found", 404);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
