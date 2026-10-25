"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/lib/desk/api";
import { CATEGORY_LABEL, URGENCY_LABEL, dayTime, time } from "@/lib/desk/labels";
import type { Activity, Category, Decision, Fact, Item, Urgency } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { DeskCard, Empty, PageTitle } from "./card";
import { LiveDot } from "./live-dot";

const TYPE_LABEL: Record<string, string> = {
  "report.received": "report",
  "model.called": "decision",
  "item.created": "handover list",
  "item.corrected": "correction",
  "fact.created": "memory",
  "fact.replaced": "memory",
  "contractor.scheduled": "contractor",
  "handover.completed": "handover",
  "mubit.step_outcome": "mubit",
};

const DOT: Record<string, string> = {
  "item.corrected": "bg-si-red",
  "fact.created": "bg-si-marker",
  "fact.replaced": "bg-si-marker",
  "handover.completed": "bg-si-green",
};

const TOOL: Record<string, string> = {
  logReport: "logged a report",
  scheduleContractor: "booked a contractor",
  addHandoverItem: "added a handover note",
  handOver: "handed over",
};

const cat = (c: unknown) => CATEGORY_LABEL[c as Category] ?? String(c);
const urg = (u: unknown) => URGENCY_LABEL[u as Urgency] ?? String(u);

function describe(a: Activity): { title: string; detail?: string } {
  const p = a.payload as Record<string, unknown>;
  switch (a.type) {
    case "report.received": {
      const r = p.report as { rawText?: string; source?: string } | undefined;
      return { title: `Report received${r?.source === "radio" ? " over the radio" : ""}`, detail: r?.rawText ? `“${r.rawText}”` : undefined };
    }
    case "model.called": {
      const input = p.input as { reply?: string; category?: string; urgency?: string; managerDecides?: boolean } | null;
      const bits = [
        input?.category && cat(input.category),
        input?.urgency && urg(input.urgency),
        input?.managerDecides ? "needs your call" : null,
      ].filter(Boolean);
      const used = Array.isArray(p.factsUsed) ? p.factsUsed.length : 0;
      return {
        title: `Spring It ${TOOL[p.tool as string] ?? (p.tool ? String(p.tool) : "made no call")}${bits.length ? `: ${bits.join(", ")}` : ""}`,
        detail: `${p.model} · ${used} ${used === 1 ? "fact" : "facts"}, ${p.correctionsUsed ?? 0} past corrections · ${p.ms} ms`,
      };
    }
    case "item.created": {
      const i = p.item as Item | undefined;
      return { title: `Added to the handover list: ${i?.summary ?? ""}`, detail: i ? [i.location, cat(i.category), urg(i.urgency)].filter(Boolean).join(" · ") : undefined };
    }
    case "item.corrected": {
      const b = p.before as Decision, af = p.after as Decision, f = p.fact as Fact | null;
      const changes = [
        b.category !== af.category && `${cat(b.category)} → ${cat(af.category)}`,
        b.urgency !== af.urgency && `${urg(b.urgency)} → ${urg(af.urgency)}`,
        b.managerDecides !== af.managerDecides && (af.managerDecides ? "now needs your call" : "team handles it"),
      ].filter(Boolean);
      return { title: `Manager corrected an item${changes.length ? `: ${changes.join(", ")}` : ""}`, detail: f ? `Remembered: ${f.text}` : undefined };
    }
    case "fact.created":
      return { title: "Fact added to memory", detail: (p.fact as Fact | undefined)?.text };
    case "fact.replaced":
      return {
        title: "Fact replaced, old one kept",
        detail: `${(p.before as Fact | undefined)?.text ?? ""} → ${(p.after as Fact | undefined)?.text ?? ""}`,
      };
    case "contractor.scheduled": {
      const i = p.item as Item | undefined;
      return { title: `Contractor booked${i?.assignee ? `: ${i.assignee}` : ""}`, detail: [i?.summary, i?.dueAt && `due ${i.dueAt}`].filter(Boolean).join(" · ") };
    }
    case "handover.completed":
      return { title: `Handed over ${p.count} ${p.count === 1 ? "item" : "items"} to ${p.to}`, detail: p.accepted ? "Accepted" : "Not accepted yet" };
    case "mubit.step_outcome":
      return { title: "Correction sent to Mubit", detail: `Status ${p.status}${p.accepted !== undefined ? `, accepted ${p.accepted}` : ""}` };
    default:
      return { title: a.type };
  }
}

/** Day heading for groups, like a commit history. */
function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
}

export function ActivityView() {
  const activity = useActivity(200);
  const rows = activity.data?.activity ?? [];
  const groups: { day: string; rows: Activity[] }[] = [];
  for (const a of rows) {
    const d = day(a.at);
    if (groups.at(-1)?.day !== d) groups.push({ day: d, rows: [] });
    groups.at(-1)!.rows.push(a);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Activity" sub={<>Everything Spring It and the desk did, newest first. <LiveDot error={!!activity.error} /></>} />
      {activity.isLoading ? (
        <DeskCard><div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div></DeskCard>
      ) : activity.error ? (
        <DeskCard><Empty title="Can't reach Spring It">{activity.error.message}. Retrying every few seconds.</Empty></DeskCard>
      ) : rows.length === 0 ? (
        <DeskCard><Empty title="No activity yet">Reports, decisions and corrections show up here.</Empty></DeskCard>
      ) : (
        groups.map((g) => (
          <DeskCard key={g.day} label={g.day}>
            <ol className="relative">
              {g.rows.map((a, i) => {
                const { title, detail } = describe(a);
                return (
                  <li key={a.seq} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < g.rows.length - 1 && <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />}
                    <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-white", DOT[a.type] ?? "bg-si-neutral")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{title}</p>
                      {detail && <p className="mt-0.5 line-clamp-3 text-sm break-words text-muted-foreground">{detail}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                        <span className="rounded-md bg-si-tint px-1.5 py-0.5 text-si-neutral">#{a.seq}</span>
                        <span>{TYPE_LABEL[a.type] ?? a.type}</span>
                        <span title={dayTime(a.at)}>{time(a.at)}</span>
                        {a.shiftId && <span className="truncate">{a.shiftId}</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </DeskCard>
        ))
      )}
    </div>
  );
}
