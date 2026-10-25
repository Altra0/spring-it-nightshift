"use client";

import { useState } from "react";
import { BookMarked, CircleDot, Radio, Send } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { londonDay, useActivity, useItems, useToday } from "@/lib/desk/api";
import { type DeskEvent, toEvents } from "@/lib/desk/events";
import { dayTime, itemTitle, time } from "@/lib/desk/labels";
import { SIGNED_IN } from "@/lib/desk/session";
import type { Activity, Item } from "@/lib/desk/types";
import { DeskCard, Empty, PageTitle } from "./card";
import { ItemIcon, KeyValueCard, SwapIcon, showCall, showCategory, showUrgency } from "./chips";
import { wasValues } from "./corrections-view";
import { LiveDot } from "./live-dot";

const TOOL: Record<string, string> = {
  logReport: "Logged it on the handover list",
  scheduleContractor: "Booked a contractor",
  addHandoverItem: "Added a note for the day manager",
  handOver: "Handed over",
};

function Disc({ children, tone = "bg-si-tint text-si-neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{children}</span>;
}

type View = { icon: React.ReactNode; title: string; sub: string; value?: string; valueSub?: string };

function view(e: DeskEvent, items: Map<string, Item>): View {
  const t = time(e.at);
  switch (e.kind) {
    case "report":
      if (e.handover)
        return { icon: <Disc tone="bg-si-green/10 text-si-green"><Send className="size-[18px]" /></Disc>, title: `Handed over to ${e.handover.to}`, sub: `${t} · ${e.handover.accepted ? "Accepted" : "Not accepted yet"}`, value: `${e.handover.count} ${e.handover.count === 1 ? "item" : "items"}` };
      if (e.item) {
        const item = items.get(e.item.id) ?? e.item; // live row: has the backfilled title and any corrections
        return {
          icon: <ItemIcon item={item} className="size-10" iconClassName="size-[18px]" />,
          title: itemTitle(item),
          sub: [item.location, t].filter(Boolean).join(" · "),
          value: item.kind === "contractor" ? (item.assignee ? item.assignee[0].toUpperCase() + item.assignee.slice(1) : "Contractor") : showUrgency(item.urgency),
          valueSub: item.kind === "contractor" ? item.dueAt ?? undefined : item.managerDecides ? "Needs your call" : showCategory(item.category),
        };
      }
      return { icon: <Disc><Radio className="size-[18px]" /></Disc>, title: "Report received", sub: `${t} · ${e.decision ? "No item recorded" : "Spring It is deciding"}` };
    case "correction": {
      const item = items.get(e.itemId);
      const was = wasValues(e);
      return { icon: <SwapIcon />, title: item ? itemTitle(item) : "Item corrected", sub: `Corrected ${t}${was ? ` · was: ${was}` : ""}`, value: showCategory(e.after.category), valueSub: showUrgency(e.after.urgency) };
    }
    case "fact":
      return { icon: <Disc tone="bg-si-marker/50 text-si-text"><BookMarked className="size-[18px]" /></Disc>, title: e.fact.text, sub: `Added to memory · ${t}` };
    case "factUpdate":
      return { icon: <SwapIcon />, title: e.after.text, sub: `Updated ${t} · was: ${e.before.text}` };
    case "handover":
      return { icon: <Disc tone="bg-si-green/10 text-si-green"><Send className="size-[18px]" /></Disc>, title: `Handed over to ${e.to}`, sub: `${t} · ${e.accepted ? "Accepted" : "Not accepted yet"}`, value: `${e.count} ${e.count === 1 ? "item" : "items"}` };
    default:
      return { icon: <Disc><CircleDot className="size-[18px]" /></Disc>, title: e.type, sub: t };
  }
}

const STEP_LABEL: Record<string, (a: Activity) => string> = {
  "report.received": (a) => ((a.payload.report as { source?: string })?.source === "radio" ? "Report came in over the radio" : "Report typed at the desk"),
  "model.called": (a) => `Spring It decided: ${TOOL[a.payload.tool as string] ?? a.payload.tool ?? "no action"}`,
  "item.created": () => "Added to the handover list",
  "contractor.scheduled": () => "Contractor booked",
  "handover.completed": (a) => `Handed over to ${a.payload.to}`,
  "fact.created": () => "Fact saved to memory",
  "item.corrected": () => `Corrected by ${SIGNED_IN.name}`,
  "fact.replaced": () => `Fact updated by ${SIGNED_IN.name}`,
  "mubit.step_outcome": (a) => `Sent to Mubit (status ${a.payload.status})`,
};

function EventDetail({ e, items }: { e: DeskEvent; items: Map<string, Item> }) {
  const v = view(e, items);
  const rows: { label: string; value: React.ReactNode; was?: React.ReactNode }[] = [];
  let quote: string | null = null;
  let reply: string | null = null;
  if (e.kind === "report") {
    quote = e.text;
    reply = e.decision?.reply ?? null;
    if (e.item) {
      rows.push({ label: "Category", value: showCategory(e.item.category) }, { label: "Urgency", value: showUrgency(e.item.urgency) }, { label: "Who decides", value: showCall(e.item.managerDecides) });
      if (e.item.location) rows.push({ label: "Location", value: e.item.location });
    }
    if (e.decision) {
      rows.push({ label: "Model", value: e.decision.model }, { label: "Memory used", value: `${e.decision.factsUsed} facts, ${e.decision.correctionsUsed} past corrections` }, { label: "Decided in", value: `${e.decision.ms} ms` });
    }
  } else if (e.kind === "correction") {
    rows.push(
      { label: "Category", value: showCategory(e.after.category), was: e.before.category !== e.after.category ? showCategory(e.before.category) : undefined },
      { label: "Urgency", value: showUrgency(e.after.urgency), was: e.before.urgency !== e.after.urgency ? showUrgency(e.before.urgency) : undefined },
      { label: "Who decides", value: showCall(e.after.managerDecides), was: e.before.managerDecides !== e.after.managerDecides ? showCall(e.before.managerDecides) : undefined },
      { label: "Changed by", value: `${SIGNED_IN.name} · ${time(e.at)}` },
    );
    if (e.fact) rows.push({ label: "Remembered", value: e.fact.text });
  } else if (e.kind === "factUpdate") {
    rows.push({ label: "Fact", value: e.after.text, was: e.before.text }, { label: "Changed by", value: `${SIGNED_IN.name} · ${time(e.at)}` });
  } else if (e.kind === "fact") {
    rows.push({ label: "Fact", value: e.fact.text }, { label: "Added", value: dayTime(e.at) });
  }
  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-3 px-5 pt-6 pb-4">
        <span className="[&>span]:size-12">{v.icon}</span>
        <SheetTitle className="pr-8 text-xl leading-snug font-semibold">{v.title}</SheetTitle>
        <SheetDescription>{v.sub}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-3 pb-6 sm:px-4">
        {quote && (
          <section className="rounded-3xl bg-card p-5">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{e.kind === "report" && e.source === "radio" ? "Radio report" : "Report"}</h3>
            <p className="text-[15px] leading-relaxed">“{quote}”</p>
            {reply && <p className="mt-3 text-sm"><span className="text-muted-foreground">Spring It replied: </span>“{reply}”</p>}
          </section>
        )}
        {rows.length > 0 && <KeyValueCard rows={rows} />}
        <h3 className="px-2 pt-2 text-sm font-medium text-muted-foreground">Steps</h3>
        <ul className="rounded-3xl bg-card px-5">
          {e.steps.map((s) => (
            <li key={s.seq} className="flex items-center justify-between gap-4 border-b border-border py-3.5 text-sm last:border-0">
              <span>{STEP_LABEL[s.type]?.(s) ?? s.type}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{time(s.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
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
  const items = useItems();
  const today = useToday();
  const [openId, setOpenId] = useState<string | null>(null);

  const itemById = new Map((items.data?.items ?? []).map((i) => [i.id, i]));
  const events = toEvents(activity.data?.activity ?? []);
  const groups: { key: string; events: DeskEvent[] }[] = [];
  for (const e of events) {
    const key = londonDay(new Date(e.at));
    if (groups.at(-1)?.key !== key) groups.push({ key, events: [] });
    groups.at(-1)!.events.push(e);
  }
  const opened = openId ? events.find((e) => e.id === openId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Activity" sub={<>Everything that happened on the desk, newest first. <LiveDot error={!!activity.error} /></>} />
      {activity.isLoading ? (
        <DeskCard><div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div></DeskCard>
      ) : activity.error && !activity.data ? (
        <DeskCard><Empty title="Can't reach Spring It">{activity.error.message}. Retrying every few seconds.</Empty></DeskCard>
      ) : events.length === 0 ? (
        <DeskCard><Empty title="No activity yet">Reports, corrections and handovers show up here.</Empty></DeskCard>
      ) : (
        groups.map((g) => (
          <DeskCard key={g.key} label={dayHeading(g.key, today)}>
            <ul className="flex flex-col">
              {g.events.map((e) => {
                const v = view(e, itemById);
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setOpenId(e.id)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-si-page"
                    >
                      {v.icon}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-medium leading-snug sm:line-clamp-1">{v.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{v.sub}</span>
                      </span>
                      {v.value && (
                        <span className="max-w-[40%] shrink-0 text-right">
                          <span className="block truncate text-sm font-semibold">{v.value}</span>
                          {v.valueSub && <span className="block truncate text-xs text-muted-foreground">{v.valueSub}</span>}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </DeskCard>
        ))
      )}
      <Sheet open={!!opened} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-0 bg-background p-0 sm:max-w-[460px]">
          {opened && <EventDetail e={opened} items={itemById} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
