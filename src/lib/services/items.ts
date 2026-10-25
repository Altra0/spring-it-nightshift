import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Item } from "@/db/schema";
import { DAY_MANAGER } from "@/db/seed";
import { newId } from "@/lib/ids";
import { logActivity } from "./activity";
import { addFact } from "./facts";
import { recordCorrectionWithMubit } from "@/lib/agent/mubit-control";

type NewItem = Omit<typeof schema.items.$inferInsert, "id">;

/** Short list title from a one-line summary: first sentence, no trailing period, at most ~60 chars. */
export function deriveTitle(summary: string): string {
  let t = summary.trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, "");
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, "") + "…";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function createItem(values: NewItem) {
  const db = await getDb();
  const title = values.title?.trim() || deriveTitle(values.summary);
  const [item] = await db.insert(schema.items).values({ id: newId("itm"), ...values, title }).returning();
  await logActivity("item.created", { item }, item.shiftId);
  return item;
}

export async function listItems(status?: Item["status"], shiftId?: string) {
  const db = await getDb();
  const conds = [
    status ? eq(schema.items.status, status) : undefined,
    shiftId ? eq(schema.items.shiftId, shiftId) : undefined,
  ].filter((c) => c !== undefined);
  return db
    .select()
    .from(schema.items)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.items.createdAt));
}

/** Close every open item from one shift (e.g. a training batch) so handover skips them. */
export async function closeShiftItems(shiftId: string) {
  const db = await getDb();
  const closed = await db
    .update(schema.items)
    .set({ status: "closed" })
    .where(and(eq(schema.items.shiftId, shiftId), eq(schema.items.status, "open")))
    .returning();
  await logActivity("items.closed", { shiftId, count: closed.length, itemIds: closed.map((i) => i.id) }, shiftId);
  return closed;
}

export async function getItem(id: string) {
  const db = await getDb();
  const [item] = await db.select().from(schema.items).where(eq(schema.items.id, id));
  return item ?? null;
}

export type CorrectionInput = {
  category?: string;
  urgency?: Item["urgency"];
  managerDecides?: boolean;
  fact?: string;
};

/** correctItem: the manager fixes an item; the fix is saved with before/after and
 *  an optional fact becomes building memory for every later call. */
export async function correctItem(id: string, input: CorrectionInput) {
  const db = await getDb();
  const item = await getItem(id);
  if (!item) return null;
  const before = { category: item.category, urgency: item.urgency, managerDecides: item.managerDecides };
  const patch: Partial<Item> = {};
  if (input.category !== undefined) patch.category = input.category;
  if (input.urgency !== undefined) patch.urgency = input.urgency;
  if (input.managerDecides !== undefined) patch.managerDecides = input.managerDecides;
  const after = { ...before, ...patch };
  const [updated] = await db
    .update(schema.items)
    .set({ ...patch, corrected: true })
    .where(eq(schema.items.id, id))
    .returning();
  const fact = input.fact?.trim() ? await addFact(input.fact.trim(), "correction", item.shiftId) : null;
  const [correction] = await db
    .insert(schema.corrections)
    .values({ id: newId("cor"), itemId: id, before, after, factId: fact?.id ?? null })
    .returning();
  await logActivity("item.corrected", { itemId: id, before, after, fact, correctionId: correction.id }, item.shiftId);
  const accepted = await recordCorrectionWithMubit({ item, before, after, fact: fact?.text ?? null, correctionId: correction.id });
  if (accepted !== null) {
    await db.update(schema.corrections).set({ mubitAccepted: accepted }).where(eq(schema.corrections.id, correction.id));
  }
  return { item: updated, fact, correction: { ...correction, mubitAccepted: accepted } };
}

/** Past corrections with the report text they fixed, for the user message. */
export async function listCorrectionsWithReports(limit = 20, before?: Date) {
  const db = await getDb();
  const rows = await db
    .select({ c: schema.corrections, report: schema.reports.rawText, summary: schema.items.summary })
    .from(schema.corrections)
    .innerJoin(schema.items, eq(schema.items.id, schema.corrections.itemId))
    .leftJoin(schema.reports, eq(schema.reports.id, schema.items.reportId))
    .where(before ? lt(schema.corrections.createdAt, before) : undefined)
    .orderBy(desc(schema.corrections.createdAt))
    .limit(limit);
  return rows.reverse().map((r) => ({
    report: r.report ?? r.summary,
    before: r.c.before as Record<string, unknown>,
    after: r.c.after as Record<string, unknown>,
  }));
}

/** handOver: every open item goes to the day manager, who accepts. */
export async function handOver(shiftId: string, to = DAY_MANAGER) {
  const db = await getDb();
  const open = await listItems("open");
  const ids = open.map((i) => i.id);
  const moved = ids.length
    ? await db
        .update(schema.items)
        .set({ status: "handed_over", assignee: to })
        .where(inArray(schema.items.id, ids))
        .returning()
    : [];
  await db.update(schema.shifts).set({ end: new Date(), handedTo: to }).where(eq(schema.shifts.id, shiftId));
  const accepted = true;
  await logActivity("handover.completed", { to, accepted, itemIds: ids, count: ids.length }, shiftId);
  return { items: moved, accepted, to };
}
