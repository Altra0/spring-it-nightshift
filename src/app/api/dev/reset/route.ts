import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bad } from "@/lib/http";

// Rehearsal helper: wipes everything and re-seeds. Off in production unless ALLOW_RESET=1.
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "1") return bad("reset disabled", 403);
  const db = await getDb();
  for (const t of ["activity", "corrections", "items", "reports", "shifts", "facts", "locations", "buildings"]) {
    await db.execute(sql.raw(`delete from ${t}`));
  }
  const g = globalThis as unknown as { __springDb?: unknown };
  g.__springDb = undefined; // next getDb() re-runs bootstrap + seed
  await getDb();
  return NextResponse.json({ ok: true });
}
