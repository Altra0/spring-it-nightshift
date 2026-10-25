/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON in a test script */
// End-to-end demo story against a running app: `npm run dev`, then `npm run demo`.
// BASE_URL defaults to http://localhost:3000. Pass --no-reset to keep existing data.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHIFT = process.env.SHIFT_ID ?? `night-${new Date().toISOString().slice(0, 10)}`;
const reset = !process.argv.includes("--no-reset");

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

async function report(text: string) {
  const r = await api("/api/report", { text, shiftId: SHIFT, source: "radio" });
  console.log(`\n> ${text}\n< ${r.reply}`);
  if (r.item) console.log(`  title: ${r.item.title}\n  item: ${r.item.category} / ${r.item.urgency} / managerDecides=${r.item.managerDecides} @ ${r.item.location}`);
  return r;
}

async function main() {
  if (reset) await api("/api/dev/reset", {});
  console.log(`Spring It demo, shift ${SHIFT}, ${BASE}`);

  console.log("\n1. It doesn't know. One correction.");
  const r1 = await report("Concierge to base. Bin store door's propped open again.");
  check("report logged as an item", !!r1.item, r1);
  check("title is short (<= 6 words)", (r1.item?.title ?? "").split(/\s+/).length <= 6, r1.item?.title);
  const c = await api(`/api/items/${r1.item.id}/correct`, {
    category: "fire_safety",
    urgency: "urgent",
    managerDecides: true,
    fact: "Bin store door = fire door on the escape route",
  });
  check("correction saved a fact", !!c.fact?.id, c);
  console.log(`  corrected: ${JSON.stringify(c.correction.before)} -> ${JSON.stringify(c.correction.after)}`);
  console.log(`  mubit step_outcome: ${c.correction.mubitAccepted === null ? "not sent (MUBIT_CONTROL off)" : `accepted=${c.correction.mubitAccepted}`}`);

  console.log("\n2. It remembers, under another name.");
  const r2 = await report("Refuse room door on level minus one, wedged open with a bin.");
  check("category fire_safety", r2.item?.category === "fire_safety", r2.item);
  check("urgency urgent", r2.item?.urgency === "urgent", r2.item);
  check("manager decides", r2.item?.managerDecides === true, r2.item);

  console.log("\n3. The rules change.");
  const { facts } = await api("/api/facts");
  const gate = facts.find((f: any) => /gate/i.test(f.text));
  check("found the side gate fact", !!gate, facts);
  const rep = await api(`/api/facts/${gate.id}/replace`, { text: "Side gate locked for scaffolding until 12 Nov", shiftId: SHIFT });
  check("old fact kept as replaced", rep.replaced?.status === "replaced" && rep.replaced?.replacedBy === rep.fact.id, rep);
  const r3 = await report("Resident at the side gate, can't get in.");
  check("reply sends them to the main entrance", /main entrance/i.test(r3.reply), r3.reply);

  console.log("\n4. Nothing lost at handover.");
  const openBefore = (await api("/api/items?status=open")).items.length;
  const r4 = await report("End of shift, hand over.");
  check("handOver called", r4.action === "handOver", r4.action);
  check("accepted by Datte Bayo", r4.handover?.accepted === true && r4.handover?.to === "Datte Bayo", r4.handover);
  check(`all ${openBefore} open items handed over`, r4.handover?.items.length === openBefore, r4.handover?.items.length);
  const openAfter = (await api("/api/items?status=open")).items.length;
  check("no open items left", openAfter === 0, openAfter);

  const { activity } = await api("/api/activity");
  const models = new Set(activity.filter((a: any) => a.type === "model.called").map((a: any) => a.payload.model));
  const tasks = new Set(activity.filter((a: any) => a.type === "model.called").map((a: any) => a.payload.task));
  console.log(`\nmodel(s) used: ${[...models].join(", ")}`);
  console.log(`task fingerprint(s): ${[...tasks].join(", ")}`);
  check("one task fingerprint across all calls", tasks.size === 1, [...tasks]);
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
