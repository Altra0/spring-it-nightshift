import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export type ActivityType =
  | "report.received"
  | "item.created"
  | "item.corrected"
  | "fact.created"
  | "fact.replaced"
  | "contractor.scheduled"
  | "handover.completed"
  | "model.called"
  | "mubit.step_outcome";

export async function logActivity(type: ActivityType, payload: Record<string, unknown>, shiftId?: string | null) {
  const db = await getDb();
  await db.insert(schema.activity).values({ type, payload, shiftId: shiftId ?? null });
}

export async function listActivity(limit = 200) {
  const db = await getDb();
  return db.select().from(schema.activity).orderBy(desc(schema.activity.seq)).limit(limit);
}
