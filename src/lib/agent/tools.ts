import { tool } from "ai";
import { z } from "zod";

// FROZEN for the same reason as SYSTEM_PROMPT: tool names, descriptions and
// schemas are part of Mubit's task key. Tools have no execute; run.ts dispatches.
export const CATEGORIES = [
  "fire_safety",
  "security",
  "access",
  "maintenance",
  "cleaning",
  "noise",
  "resident_welfare",
  "contractor",
  "other",
] as const;
export const URGENCIES = ["low", "normal", "urgent"] as const;

export const logReportInput = z.object({
  summary: z.string().describe("One line, what happened, in plain words."),
  category: z.enum(CATEGORIES),
  location: z.string().nullable().describe("A name from LOCATIONS, or null."),
  urgency: z.enum(URGENCIES),
  managerDecides: z.boolean(),
  reply: z.string().describe("One short radio sentence back to the staff member."),
});

export const scheduleContractorInput = z.object({
  trade: z.string().describe("e.g. plumber, electrician"),
  location: z.string().nullable(),
  due: z.string().nullable().describe("When they are due, exactly as stated in the report, or null."),
  summary: z.string(),
  reply: z.string(),
});

export const addHandoverItemInput = z.object({
  note: z.string(),
  reply: z.string(),
});

export const handOverInput = z.object({
  reply: z.string(),
});

export const AGENT_TOOLS = {
  logReport: tool({
    description: "Log a report as one open item for the shift.",
    inputSchema: logReportInput,
  }),
  scheduleContractor: tool({
    description: "Record a contractor visit that is due.",
    inputSchema: scheduleContractorInput,
  }),
  addHandoverItem: tool({
    description: "Add a note for the day manager to the handover.",
    inputSchema: addHandoverItemInput,
  }),
  handOver: tool({
    description: "End the shift and hand all open items to the day manager.",
    inputSchema: handOverInput,
  }),
};

export type AgentToolName = keyof typeof AGENT_TOOLS;
