import { NextResponse } from "next/server";
import { z } from "zod";
import { closeShiftItems } from "@/lib/services/items";
import { bad, devToolsAllowed, parseBody } from "@/lib/http";

const Body = z.object({ shiftId: z.string().min(1) });

// Rehearsal helper: close one shift's open items (e.g. a training batch). Facts stay.
export async function POST(req: Request) {
  if (!devToolsAllowed()) return bad("disabled", 403);
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  return NextResponse.json({ items: await closeShiftItems(body.shiftId) });
}
