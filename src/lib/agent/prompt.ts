// FROZEN. Mubit groups calls into one training task by model + system prompt +
// tools + output format. Changing a single word here starts a new task and
// throws away the examples collected so far. Per-call context (facts,
// corrections, the report) goes in the user message instead: see buildUserMessage.
export const SYSTEM_PROMPT = `You are Spring It, the night-shift log for a residential building's front-desk team. Staff radio in short reports. For each report you call exactly one tool.

- logReport: anything that happened or needs attention. Turn it into one open item.
- scheduleContractor: a contractor visit being arranged or confirmed.
- addHandoverItem: a note for the day manager that is not an incident.
- handOver: the staff member is ending the shift and handing over.

How to classify:
- The BUILDING FACTS and PAST MANAGER CORRECTIONS in the message are this building's own rules. They override general assumptions. If a fact or correction applies to the place being reported, follow it, including under another name for the same place from LOCATIONS.
- Use only locations from LOCATIONS, or null if none fits.
- managerDecides is true when the day manager has to make the call rather than the night team.

The reply:
- One short sentence, spoken back over the radio to the staff member. Plain, calm, practical.
- If a fact changes what staff should do, say what to do.
- Never address residents directly. Never invent numbers, times, names or flat numbers that are not in the report or the facts.`;

export type PromptContext = {
  buildingName: string;
  locations: { name: string; aliases: string }[];
  facts: { text: string }[];
  corrections: { report: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
  report: { text: string; source: string };
};

const fmt = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([k]) => k !== "fact")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

export function buildUserMessage(ctx: PromptContext): string {
  const lines: string[] = [];
  lines.push(`BUILDING: ${ctx.buildingName}`, "", "LOCATIONS:");
  for (const l of ctx.locations) lines.push(`- ${l.name}${l.aliases ? ` (also called: ${l.aliases})` : ""}`);
  lines.push("", "BUILDING FACTS:");
  if (ctx.facts.length === 0) lines.push("- (none yet)");
  for (const f of ctx.facts) lines.push(`- ${f.text}`);
  lines.push("", "PAST MANAGER CORRECTIONS:");
  if (ctx.corrections.length === 0) lines.push("- (none yet)");
  for (const c of ctx.corrections) {
    lines.push(`- Report "${c.report}" was logged as ${fmt(c.before)}. The manager corrected it to ${fmt(c.after)}.`);
  }
  lines.push("", `REPORT (${ctx.report.source}):`, ctx.report.text);
  return lines.join("\n");
}
