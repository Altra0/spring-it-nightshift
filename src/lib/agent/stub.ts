import type { LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";

// Offline stand-in used only when MUBIT_API_KEY is unset or LLM_MODE=stub, so the
// wiring and scripts/demo.ts can run without network. It is NOT the product's
// intelligence: it applies facts and corrections with keyword rules. Never demo it.

function promptText(options: LanguageModelV4CallOptions): string {
  const user = [...options.prompt].reverse().find((m) => m.role === "user");
  if (!user || typeof user.content === "string") return "";
  return user.content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
}

function section(text: string, name: string): string[] {
  const start = text.indexOf(`${name}:`);
  if (start < 0) return [];
  const rest = text.slice(start + name.length + 1).split("\n\n")[0];
  return rest.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
}

function decide(text: string): { toolName: string; input: Record<string, unknown> } {
  const report = text.split(/REPORT \([^)]*\):\n/)[1]?.trim() ?? "";
  // Short summary like the real model's: drop the radio call-sign opener.
  const summary = report.replace(/^[\w ]+ to [\w ]+[.,]\s*/i, "").replace(/\.$/, "");
  const r = report.toLowerCase();
  if (/hand ?over|end of (the )?shift/.test(r)) {
    return { toolName: "handOver", input: { reply: "Copy, handing everything over to the day manager." } };
  }
  const locations = section(text, "LOCATIONS").map((l) => {
    const m = l.match(/^(.*?)(?: \(also called: (.*)\))?$/)!;
    return { name: m[1], names: [m[1], ...(m[2] ? m[2].split(", ") : [])].map((n) => n.toLowerCase()) };
  });
  const words = (s: string) => s.split(/\W+/).filter((w) => w.length > 3);
  const match = (s: string, loc: { names: string[] }) =>
    loc.names.some((n) => s.includes(n) || words(n).every((w) => s.includes(w)));
  const loc = locations.find((l) => match(r, l)) ?? null;
  if (/plumber|electrician|engineer|contractor/.test(r)) {
    return {
      toolName: "scheduleContractor",
      input: { trade: r.match(/plumber|electrician|engineer|contractor/)![0], location: loc?.name ?? null, due: null, summary, reply: "Copy, contractor noted." },
    };
  }
  const facts = section(text, "BUILDING FACTS").filter((f) => loc && match(f.toLowerCase(), loc));
  const corrected = section(text, "PAST MANAGER CORRECTIONS").find((c) => loc && match(c.toLowerCase(), loc));
  let category = /door|propped|wedged/.test(r) ? "security" : /can't get in|locked out/.test(r) ? "access" : "other";
  let urgency = "normal";
  let managerDecides = false;
  let reply = "Copy, logged.";
  if (facts.some((f) => /fire door|escape route/i.test(f)) || (corrected && /fire_safety/.test(corrected))) {
    category = "fire_safety";
    urgency = "urgent";
    managerDecides = true;
    reply = "Copy, fire door on the escape route, flagged urgent for the manager.";
  }
  const locked = facts.find((f) => /locked|closed/i.test(f));
  if (locked && category === "access") reply = `Copy, ${locked.replace(/\.$/, "").toLowerCase()}, send them to the main entrance.`;
  return { toolName: "logReport", input: { summary, category, location: loc?.name ?? null, urgency, managerDecides, reply } };
}

export const stubModel: LanguageModelV4 = {
  specificationVersion: "v4",
  provider: "stub",
  modelId: "stub-rules",
  supportedUrls: {},
  async doGenerate(options) {
    const { toolName, input } = decide(promptText(options));
    return {
      content: [{ type: "tool-call", toolCallId: `stub_${Date.now()}`, toolName, input: JSON.stringify(input) }],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      },
      warnings: [],
    };
  },
  async doStream() {
    throw new Error("stub model does not stream");
  },
} as LanguageModelV4;
