import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { BUILDING_ID } from "@/db/seed";
import { getBuildingFacts } from "@/lib/services/facts";
import { listCorrectionsWithReports } from "@/lib/services/items";
import { getModel } from "./model";
import { classify } from "./run";
import { logReportInput } from "./tools";

export const REPLAY_SHIFT = "replay";

export type Answer = {
  tool: string;
  title: string | null;
  category: string | null;
  urgency: string | null;
  managerDecides: boolean | null;
  reply: string;
  model: string;
  factsUsed: number;
};

function toAnswer(call: Awaited<ReturnType<typeof classify>>, factsUsed: number): Answer {
  const model = getModel().label;
  if (!call) return { tool: "none", title: null, category: null, urgency: null, managerDecides: null, reply: "", model, factsUsed };
  const input = call.input as Record<string, unknown>;
  if (call.toolName === "logReport") {
    const a = logReportInput.parse(input);
    return { tool: "logReport", title: a.title, category: a.category, urgency: a.urgency, managerDecides: a.managerDecides, reply: a.reply, model, factsUsed };
  }
  return { tool: call.toolName, title: null, category: null, urgency: null, managerDecides: null, reply: String(input.reply ?? ""), model, factsUsed };
}

/** Same radio text, same frozen prompt and tools, two memories: as it was just before
 *  the correction, and now. Creates no items or reports; calls are logged as replays. */
export async function replayCorrection(correctionId: string) {
  const db = await getDb();
  const [correction] = await db.select().from(schema.corrections).where(eq(schema.corrections.id, correctionId));
  if (!correction) return null;
  const [item] = await db.select().from(schema.items).where(eq(schema.items.id, correction.itemId));
  const [report] = item?.reportId ? await db.select().from(schema.reports).where(eq(schema.reports.id, item.reportId)) : [];
  const text = report?.rawText ?? item?.summary ?? "";
  const source = report?.source ?? "radio";
  const at = correction.createdAt;

  // Facts as they stood just before the correction: created earlier, and not yet
  // replaced by a fact that was itself created earlier.
  const all = await db.select().from(schema.facts).where(eq(schema.facts.buildingId, BUILDING_ID));
  const createdAt = new Map(all.map((f) => [f.id, f.createdAt]));
  const factsBefore = all.filter((f) => {
    if (f.createdAt >= at || f.id === correction.factId) return false;
    const successor = f.replacedBy ? createdAt.get(f.replacedBy) : undefined;
    return !(successor && successor < at);
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const [{ facts: factsNow, locations }, correctionsNow, correctionsBefore] = await Promise.all([
    getBuildingFacts(),
    listCorrectionsWithReports(),
    listCorrectionsWithReports(20, at),
  ]);

  const common = { text, source, shiftId: REPLAY_SHIFT, locations, replay: true };
  const [beforeCall, afterCall] = await Promise.all([
    classify({ ...common, facts: factsBefore, corrections: correctionsBefore }),
    classify({ ...common, facts: factsNow, corrections: correctionsNow }),
  ]);
  return {
    text,
    correction,
    before: toAnswer(beforeCall, factsBefore.length),
    after: toAnswer(afterCall, factsNow.length),
  };
}
