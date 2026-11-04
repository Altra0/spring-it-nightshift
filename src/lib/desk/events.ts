import type { Activity, Decision, Fact, Item } from "./types";

/** One thing that happened, built from the raw activity log: a report and every
 *  system step it caused (decision, item, contractor, handover) fold into one event. */
export type DeskEvent =
  | { kind: "report"; id: string; at: string; text: string | null; source: string | null; item: Item | null;
      decision: { tool: string | null; model: string; factsUsed: number; correctionsUsed: number; ms: number; reply: string | null } | null;
      handover: { to: string; count: number; accepted: boolean } | null; steps: Activity[] }
  | { kind: "correction"; id: string; at: string; itemId: string; before: Decision; after: Decision; fact: Fact | null; steps: Activity[] }
  | { kind: "fact"; id: string; at: string; fact: Fact; steps: Activity[] }
  | { kind: "factUpdate"; id: string; at: string; before: Fact; after: Fact; steps: Activity[] }
  | { kind: "handover"; id: string; at: string; to: string; count: number; accepted: boolean; steps: Activity[] }
  | { kind: "other"; id: string; at: string; type: string; steps: Activity[] };

/** Activity arrives newest first; returns events newest first. */
export function toEvents(activity: Activity[]): DeskEvent[] {
  const events: DeskEvent[] = [];
  const reports = new Map<string, Extract<DeskEvent, { kind: "report" }>>();
  const facts = new Map<string, Extract<DeskEvent, { kind: "fact" }>>();
  let lastCorrection: Extract<DeskEvent, { kind: "correction" }> | null = null;

  for (const a of [...activity].reverse()) {
    const p = a.payload as Record<string, unknown>;
    switch (a.type) {
      case "report.received": {
        const r = p.report as { id: string; rawText?: string; source?: string };
        const ev = { kind: "report" as const, id: `r-${r.id}`, at: a.at, text: r.rawText ?? null, source: r.source ?? null, item: null, decision: null, handover: null, steps: [a] };
        reports.set(r.id, ev);
        events.push(ev);
        break;
      }
      case "model.called": {
        const ev = reports.get(p.reportId as string);
        if (!ev) break;
        ev.steps.push(a);
        ev.decision = {
          tool: (p.tool as string | null) ?? null,
          model: String(p.model ?? ""),
          factsUsed: Array.isArray(p.factsUsed) ? p.factsUsed.length : 0,
          correctionsUsed: Number(p.correctionsUsed ?? 0),
          ms: Number(p.ms ?? 0),
          reply: ((p.input as { reply?: string } | null)?.reply) ?? null,
        };
        break;
      }
      case "item.created":
      case "contractor.scheduled": {
        const item = p.item as Item;
        const ev = item?.reportId ? reports.get(item.reportId) : undefined;
        if (ev) {
          ev.steps.push(a);
          ev.item = item;
        } else events.push({ kind: "other", id: `a-${a.seq}`, at: a.at, type: a.type, steps: [a] });
        break;
      }
      case "handover.completed": {
        const h = { to: String(p.to), count: Number(p.count ?? 0), accepted: !!p.accepted };
        // A spoken "hand over" is one event with the handover it caused.
        const spoken = [...reports.values()].reverse().find((r) => r.decision?.tool === "handOver" && !r.handover);
        if (spoken) {
          spoken.handover = h;
          spoken.steps.push(a);
        } else events.push({ kind: "handover", id: `a-${a.seq}`, at: a.at, ...h, steps: [a] });
        break;
      }
      case "fact.created": {
        const fact = p.fact as Fact;
        const ev = { kind: "fact" as const, id: `a-${a.seq}`, at: a.at, fact, steps: [a] };
        facts.set(fact.id, ev);
        events.push(ev);
        break;
      }
      case "item.corrected": {
        const fact = (p.fact as Fact | null) ?? null;
        const steps = [a];
        // The fact a correction saved belongs to the correction, not its own row.
        const factEv = fact ? facts.get(fact.id) : undefined;
        if (factEv) {
          events.splice(events.indexOf(factEv), 1);
          steps.unshift(...factEv.steps);
        }
        lastCorrection = { kind: "correction", id: `a-${a.seq}`, at: a.at, itemId: String(p.itemId), before: p.before as Decision, after: p.after as Decision, fact, steps };
        events.push(lastCorrection);
        break;
      }
      case "mubit.step_outcome":
        if (lastCorrection) lastCorrection.steps.push(a);
        break;
      case "fact.replaced":
        events.push({ kind: "factUpdate", id: `a-${a.seq}`, at: a.at, before: p.before as Fact, after: p.after as Fact, steps: [a] });
        break;
      default:
        events.push({ kind: "other", id: `a-${a.seq}`, at: a.at, type: a.type, steps: [a] });
    }
  }
  return events.reverse();
}
