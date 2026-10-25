import { NextResponse } from "next/server";
import { z } from "zod";
import { DAY_MANAGER } from "@/db/seed";
import { handOver } from "@/lib/services/items";
import { ensureShift } from "@/lib/services/shifts";
import { parseBody } from "@/lib/http";

const Body = z.object({ shiftId: z.string().min(1), to: z.string().default(DAY_MANAGER) });

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  await ensureShift(body.shiftId);
  return NextResponse.json(await handOver(body.shiftId, body.to));
}
