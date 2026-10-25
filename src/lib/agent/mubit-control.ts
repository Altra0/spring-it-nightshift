import type { Item } from "@/db/schema";
import { logActivity } from "@/lib/services/activity";

// Best effort: the inference middleware has no correction API, so the main
// learning loop is correction -> fact -> next call answers right -> Mubit trains.
// The older control-plane step outcome is opt-in (MUBIT_CONTROL=on): on 25 Oct
// POST api.mubit.ai/v2/control/step_outcome returned 404 for our key, and the
// docs give no host for it. Returns accepted, or null when skipped or unreachable.
export async function recordCorrectionWithMubit(args: {
  item: Item;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fact: string | null;
  correctionId: string;
}): Promise<boolean | null> {
  const key = process.env.MUBIT_API_KEY;
  if (!key || process.env.MUBIT_CONTROL !== "on" || process.env.LLM_MODE === "stub") return null;
  const base = process.env.MUBIT_CONTROL_URL ?? "https://api.mubit.ai";
  const changed = Object.keys(args.after).filter((k) => args.after[k] !== args.before[k]);
  const body = {
    run_id: args.item.shiftId,
    step_id: args.correctionId,
    step_name: "classify_report",
    outcome: "failure",
    signal: -1,
    rationale: `Manager corrected ${changed.join(", ") || "the item"} for "${args.item.summary}".`,
    directive_hint: args.fact ?? undefined,
    agent_id: "spring-it",
    metadata_json: JSON.stringify({ itemId: args.item.id, before: args.before, after: args.after }),
  };
  try {
    const res = await fetch(`${base}/v2/control/step_outcome`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => ({}))) as { accepted?: boolean; step_outcome_id?: string };
    const accepted = res.ok ? json.accepted ?? true : false;
    await logActivity("mubit.step_outcome", { status: res.status, accepted, id: json.step_outcome_id ?? null }, args.item.shiftId);
    return accepted;
  } catch (err) {
    await logActivity("mubit.step_outcome", { status: "unreachable", error: String(err) }, args.item.shiftId);
    return null;
  }
}
