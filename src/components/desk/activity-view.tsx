"use client";

import { createElement } from "react";
import {
  ArrowLeftRight, BookMarked, Bot, CircleDot, ClipboardList, Pencil, Radio, Send, Wrench, type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { londonDay, useActivity, useToday } from "@/lib/desk/api";
import { CATEGORY_LABEL, URGENCY_LABEL, time } from "@/lib/desk/labels";
import type { Activity, Category, Decision, Fact, Item, Urgency } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { DeskCard, Empty, PageTitle } from "./card";
import { wasValues } from "./corrections-view";
import { LiveDot } from "./live-dot";

const cat = (c: unknown) => CATEGORY_LABEL[c as Category] ?? String(c);
const urg = (u: unknown) => URGENCY_LABEL[u as Urgency] ?? String(u);

const TOOL: Record<string, string> = {
  logReport: "Spring It logged a report",
  scheduleContractor: "Spring It booked a contractor",
  addHandoverItem: "Spring It added a handover note",
  handOver: "Spring It handed over",
};

type Row = { icon: LucideIcon; tone: string; title: string; sub?: string; value?: string; valueSub?: string };

function describe(a: Activity): Row {
  const p = a.payload as Record<string, unknown>;
  switch (a.type) {
    case "report.received": {
      const r = p.report as { rawText?: string; source?: string } | undefined;
      return { icon: Radio, tone: "bg-si-tint text-si-neutral", title: r?.rawText ? `“${r.rawText}”` : "Report received", value: r?.source === "radio" ? "Radio" : "Typed" };
    }
    case "model.called": {
      const input = p.input as { category?: string; urgency?: string; managerDecides?: boolean } | null;
      const used = Array.isArray(p.factsUsed) ? p.factsUsed.length : 0;
      return {
        icon: Bot,
        tone: "bg-si-neutral/10 text-si-neutral",
        title: TOOL[p.tool as string] ?? (p.tool ? String(p.tool) : "Spring It made no call"),
        sub: `Used ${used} ${used === 1 ? "fact" : "facts"} and ${p.correctionsUsed ?? 0} past corrections`,
        value: input?.category ? cat(input.category) : undefined,
        valueSub: [input?.urgency && urg(input.urgency), input?.managerDecides && "your call"].filter(Boolean).join(", ") || undefined,
      };
    }
    case "item.created": {
      const i = p.item as Item | undefined;
      return { icon: ClipboardList, tone: "bg-si-tint text-si-neutral", title: i?.summary ?? "Added to the handover list", sub: ["Added to the handover list", i?.location].filter(Boolean).join(" · "), value: i ? urg(i.urgency) : undefined, valueSub: i ? cat(i.category) : undefined };
    }
    case "item.corrected": {
      const b = p.before as Decision, af = p.after as Decision, f = p.fact as Fact | null;
      const was = wasValues({ before: b, after: af });
      return {
        icon: ArrowLeftRight,
        tone: "bg-si-red/10 text-si-red",
        title: "Manager corrected an item",
        sub: [was && `was: ${was}`, f && `remembered: ${f.text}`].filter(Boolean).join(" · ") || undefined,
        value: cat(af.category),
        valueSub: urg(af.urgency),
      };
    }
    case "fact.created":
      return { icon: BookMarked, tone: "bg-si-marker/50 text-si-text", title: (p.fact as Fact | undefined)?.text ?? "Fact added", sub: "Added to memory" };
    case "fact.replaced":
      return { icon: ArrowLeftRight, tone: "bg-si-marker/50 text-si-text", title: (p.after as Fact | undefined)?.text ?? "Fact updated", sub: `Fact updated · was: ${(p.before as Fact | undefined)?.text ?? ""}` };
    case "contractor.scheduled": {
      const i = p.item as Item | undefined;
      return { icon: Wrench, tone: "bg-si-marker/50 text-si-text", title: `Contractor booked${i?.assignee ? `: ${i.assignee}` : ""}`, sub: i?.summary, value: i?.dueAt ?? undefined };
    }
    case "handover.completed":
      return { icon: Send, tone: "bg-si-green/10 text-si-green", title: `Handed over to ${p.to}`, sub: p.accepted ? "Accepted" : "Not accepted yet", value: `${p.count} ${p.count === 1 ? "item" : "items"}` };
    case "mubit.step_outcome":
      return { icon: Pencil, tone: "bg-si-tint text-si-neutral", title: "Correction sent to Mubit", sub: `Status ${p.status}` };
    default:
      return { icon: CircleDot, tone: "bg-si-tint text-si-neutral", title: a.type };
  }
}

function dayHeading(key: string, today: string | null) {
  if (today && key === today) return "Today";
  if (today) {
    const y = new Date(`${today}T12:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    if (key === y.toISOString().slice(0, 10)) return "Yesterday";
  }
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function ActivityView() {
  const activity = useActivity(200);
  const today = useToday();
  const rows = activity.data?.activity ?? [];
  const groups: { key: string; rows: Activity[] }[] = [];
  for (const a of rows) {
    const key = londonDay(new Date(a.at));
    if (groups.at(-1)?.key !== key) groups.push({ key, rows: [] });
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
          <DeskCard key={g.key} label={dayHeading(g.key, today)}>
            <ul className="flex flex-col">
              {g.rows.map((a) => {
                const r = describe(a);
                return (
                  <li key={a.seq} className="flex items-center gap-3 py-2.5">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", r.tone)}>
                      {createElement(r.icon, { className: "size-[18px]" })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-snug sm:line-clamp-1">{r.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {time(a.at)}{r.sub ? ` · ${r.sub}` : ""}
                      </span>
                    </span>
                    {r.value && (
                      <span className="max-w-[40%] shrink-0 text-right">
                        <span className="block truncate text-sm font-semibold">{r.value}</span>
                        {r.valueSub && <span className="block truncate text-xs text-muted-foreground">{r.valueSub}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </DeskCard>
        ))
      )}
    </div>
  );
}
