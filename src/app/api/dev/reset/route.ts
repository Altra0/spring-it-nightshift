import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bad } from "@/lib/http";

// Rehearsal helper: wipes everything and re-seeds. Off in production unless ALLOW_RESET=1.
// { keepFacts: true } keeps standalone manager facts (POST /api/facts, e.g. the SOP set)
// and drops only demo state: items, reports, corrections, activity, shifts, facts that
// came from a correction or a replace, and the seed (re-created fresh).
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "1") return bad("reset disabled", 403);
  const body = (await req.json().catch(() => ({}))) as { keepFacts?: boolean };
  const db = await getDb();
  if (body.keepFacts) {
    await db.execute(
      sql.raw(`delete from facts where not (
        source = 'correction' and status = 'active'
        and id not in (select fact_id from corrections where fact_id is not null)
        and id not in (select replaced_by from facts where replaced_by is not null))`),
    );
  } else {
    await db.execute(sql.raw("delete from facts"));
  }
  for (const t of ["activity", "corrections", "items", "reports", "shifts", "locations", "buildings"]) {
    await db.execute(sql.raw(`delete from ${t}`));
  }
  const g = globalThis as unknown as { __springDb?: unknown };
  g.__springDb = undefined; // next getDb() re-runs bootstrap + seed
  await getDb();
  return NextResponse.json({ ok: true, keptFacts: !!body.keepFacts });
}
