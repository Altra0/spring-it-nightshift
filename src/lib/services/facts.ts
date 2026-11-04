import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BUILDING_ID } from "@/db/seed";
import { newId } from "@/lib/ids";
import { logActivity } from "./activity";

export async function listFacts(opts: { includeReplaced?: boolean } = {}) {
  const db = await getDb();
  const where = opts.includeReplaced
    ? eq(schema.facts.buildingId, BUILDING_ID)
    : and(eq(schema.facts.buildingId, BUILDING_ID), eq(schema.facts.status, "active"));
  return db.select().from(schema.facts).where(where).orderBy(asc(schema.facts.createdAt));
}

/** getBuildingFacts: active facts + locations, read before every model call. */
export async function getBuildingFacts() {
  const db = await getDb();
  const [facts, locations] = await Promise.all([
    listFacts(),
    db.select().from(schema.locations).where(eq(schema.locations.buildingId, BUILDING_ID)),
  ]);
  return { facts, locations };
}

export async function addFact(text: string, source: "correction" | "seed", shiftId?: string | null) {
  const db = await getDb();
  const [fact] = await db
    .insert(schema.facts)
    .values({ id: newId("fct"), buildingId: BUILDING_ID, text, source })
    .returning();
  await logActivity("fact.created", { fact }, shiftId);
  return fact;
}

/** replaceFact: the old fact stays in the table as `replaced`, pointing at its successor. */
export async function replaceFact(id: string, text: string, shiftId?: string | null) {
  const db = await getDb();
  const [old] = await db.select().from(schema.facts).where(eq(schema.facts.id, id));
  if (!old) return null;
  const [fact] = await db
    .insert(schema.facts)
    .values({ id: newId("fct"), buildingId: old.buildingId, text, source: "correction" })
    .returning();
  const [replaced] = await db
    .update(schema.facts)
    .set({ status: "replaced", replacedBy: fact.id })
    .where(eq(schema.facts.id, id))
    .returning();
  await logActivity("fact.replaced", { before: replaced, after: fact }, shiftId);
  return { fact, replaced };
}
