import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, URGENCIES } from "@/lib/agent/tools";
import { correctItem } from "@/lib/services/items";
import { bad, parseBody, serverError } from "@/lib/http";

const Body = z.object({
  category: z.enum(CATEGORIES).optional(),
  urgency: z.enum(URGENCIES).optional(),
  managerDecides: z.boolean().optional(),
  fact: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  try {
    const result = await correctItem(id, body);
    if (!result) return bad("item not found", 404);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
