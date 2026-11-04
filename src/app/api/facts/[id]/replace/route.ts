import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceFact } from "@/lib/services/facts";
import { bad, parseBody } from "@/lib/http";

const Body = z.object({ text: z.string().min(1), shiftId: z.string().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  const result = await replaceFact(id, body.text, body.shiftId);
  if (!result) return bad("fact not found", 404);
  return NextResponse.json(result);
}
