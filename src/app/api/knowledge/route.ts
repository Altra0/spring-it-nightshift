import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BUILDING_ID, MANAGER_ON_DUTY } from "@/db/seed";

// Knowledge versions for "What Spring It knows". v1 = everything loaded up front (seed
// + standalone facts such as the SOP set); then one version per correction or fact
// replace, in order. Returned newest first.
export async function GET() {
  const db = await getDb();
  const [facts, corrections] = await Promise.all([
    db.select().from(schema.facts).where(eq(schema.facts.buildingId, BUILDING_ID)).orderBy(asc(schema.facts.createdAt)),
    db
      .select({ c: schema.corrections, title: schema.items.title, summary: schema.items.summary })
      .from(schema.corrections)
      .leftJoin(schema.items, eq(schema.items.id, schema.corrections.itemId))
      .orderBy(asc(schema.corrections.createdAt)),
  ]);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const correctionFactIds = new Set(corrections.map((r) => r.c.factId).filter(Boolean));
  const successorOf = new Map(facts.filter((f) => f.replacedBy).map((f) => [f.replacedBy!, f]));
  const onboarded = facts.filter((f) => !correctionFactIds.has(f.id) && !successorOf.has(f.id));

  type Version = { version: number; kind: "correction" | "fact_update"; text: string | null; replacedText?: string; itemTitle?: string | null; before?: unknown; after?: unknown; correctionId?: string; by: string; at: Date };
  const events: Omit<Version, "version">[] = [
    ...corrections.map((r) => ({
      kind: "correction" as const,
      text: r.c.factId ? byId.get(r.c.factId)?.text ?? null : null,
      itemTitle: r.title ?? r.summary,
      before: r.c.before,
      after: r.c.after,
      correctionId: r.c.id,
      by: MANAGER_ON_DUTY,
      at: r.c.createdAt,
    })),
    ...[...successorOf.entries()].map(([newId, old]) => ({
      kind: "fact_update" as const,
      text: byId.get(newId)?.text ?? null,
      replacedText: old.text,
      by: MANAGER_ON_DUTY,
      at: byId.get(newId)?.createdAt ?? old.createdAt,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const versions: Version[] = events.map((e, i) => ({ ...e, version: i + 2 })).reverse();

  return NextResponse.json({
    onboarded: { version: 1, label: "Onboarded from building SOPs", factCount: onboarded.length, at: onboarded[0]?.createdAt ?? null },
    versions,
    current: versions[0]?.version ?? 1,
  });
}
