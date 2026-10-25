import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { logActivity } from "@/lib/services/activity";
import { bad, parseBody } from "@/lib/http";

const Body = z.object({ id: z.string().min(1) });

// Rehearsal helper: undo a replace made by mistake. Reactivates the fact and
// deletes the fact that replaced it.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "1") return bad("disabled", 403);
  const body = await parseBody(req, Body);
  if (body instanceof Response) return body;
  const db = await getDb();
  const [old] = await db.select().from(schema.facts).where(eq(schema.facts.id, body.id));
  if (!old) return bad("fact not found", 404);
  if (old.replacedBy) await db.delete(schema.facts).where(eq(schema.facts.id, old.replacedBy));
  const [fact] = await db
    .update(schema.facts)
    .set({ status: "active", replacedBy: null })
    .where(eq(schema.facts.id, body.id))
    .returning();
  await logActivity("fact.restored", { fact, removed: old.replacedBy });
  return NextResponse.json({ fact });
}
