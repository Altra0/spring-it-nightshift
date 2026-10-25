import { generateText } from "ai";
import { getDb, schema } from "@/db/client";
import { SEED } from "@/db/seed";
import { newId } from "@/lib/ids";
import { logActivity } from "@/lib/services/activity";
import { getBuildingFacts } from "@/lib/services/facts";
import { createItem, handOver, listCorrectionsWithReports } from "@/lib/services/items";
import { ensureShift } from "@/lib/services/shifts";
import type { Item } from "@/db/schema";
import { getModel } from "./model";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { TASK_FINGERPRINT } from "./fingerprint";
import { AGENT_TOOLS, addHandoverItemInput, handOverInput, logReportInput, scheduleContractorInput } from "./tools";

const HANDOVER_INTENT = /\bhand(ing)?[\s-]?over\b|\bend of (the |my |our )?shift\b/i;

export type ReportInput = { text: string; shiftId: string; source: "radio" | "text" };
export type ReportResult = {
  item: Item | null;
  reply: string;
  action: string;
  handover?: { items: Item[]; accepted: boolean; to: string };
};

/** logReport entry point: one report in, one model call through Mubit, one action out. */
export async function handleReport(input: ReportInput): Promise<ReportResult> {
  const db = await getDb();
  await ensureShift(input.shiftId);
  const [report] = await db
    .insert(schema.reports)
    .values({ id: newId("rpt"), shiftId: input.shiftId, rawText: input.text, source: input.source })
    .returning();
  await logActivity("report.received", { report }, input.shiftId);

  const [{ facts, locations }, corrections] = await Promise.all([getBuildingFacts(), listCorrectionsWithReports()]);
  const userMessage = buildUserMessage({
    buildingName: SEED.building.name,
    locations,
    facts,
    corrections,
    report: { text: input.text, source: input.source },
  });

  const { model, label, sessionOptions } = getModel();
  const started = Date.now();
  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: AGENT_TOOLS,
    toolChoice: "required",
    providerOptions: sessionOptions(input.shiftId) as never,
  });
  const call = result.toolCalls[0];
  await logActivity(
    "model.called",
    {
      model: label,
      task: TASK_FINGERPRINT,
      reportId: report.id,
      tool: call?.toolName ?? null,
      input: call?.input ?? null,
      factsUsed: facts.map((f) => f.id),
      correctionsUsed: corrections.length,
      ms: Date.now() - started,
    },
    input.shiftId,
  );
  if (!call) throw new Error("model returned no tool call");

  const base = { shiftId: input.shiftId, reportId: report.id };
  switch (call.toolName) {
    case "logReport": {
      const a = logReportInput.parse(call.input);
      const item = await createItem({
        ...base,
        kind: "report",
        title: a.title,
        summary: a.summary,
        category: a.category,
        location: a.location,
        urgency: a.urgency,
        managerDecides: a.managerDecides,
      });
      return { item, reply: a.reply, action: "logReport" };
    }
    case "scheduleContractor": {
      const a = scheduleContractorInput.parse(call.input);
      const item = await createItem({
        ...base,
        kind: "contractor",
        title: `${a.trade.charAt(0).toUpperCase()}${a.trade.slice(1)} visit${a.location ? ` to ${a.location}` : ""}${a.due ? `, ${a.due}` : ""}`,
        summary: a.summary,
        category: "contractor",
        location: a.location,
        urgency: "normal",
        assignee: a.trade,
        dueAt: a.due,
      });
      await logActivity("contractor.scheduled", { item }, input.shiftId);
      return { item, reply: a.reply, action: "scheduleContractor" };
    }
    case "addHandoverItem": {
      const a = addHandoverItemInput.parse(call.input);
      const item = await createItem({ ...base, kind: "note", summary: a.note, category: "other", urgency: "low" });
      return { item, reply: a.reply, action: "addHandoverItem" };
    }
    case "handOver": {
      const a = handOverInput.parse(call.input);
      // Handover moves every open item, so it needs the words, not just the model's
      // reading of a noisy transcript. Server-side guard: prompt and tools stay frozen.
      if (!HANDOVER_INTENT.test(input.text)) {
        await logActivity("handover.blocked", { reportId: report.id, text: input.text }, input.shiftId);
        return { item: null, reply: "Not handed over. Say end of shift, hand over, when you're ready.", action: "handOverBlocked" };
      }
      const handover = await handOver(input.shiftId);
      return { item: null, reply: a.reply, action: "handOver", handover };
    }
    default:
      throw new Error(`unknown tool ${call.toolName}`);
  }
}
