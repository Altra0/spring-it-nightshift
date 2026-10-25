import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export async function ensureShift(shiftId: string, staff = "Night concierge") {
  const db = await getDb();
  const [existing] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId));
  if (existing) return existing;
  const [shift] = await db.insert(schema.shifts).values({ id: shiftId, staff }).onConflictDoNothing().returning();
  return shift ?? (await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)))[0];
}
