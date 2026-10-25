"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { desk, useActivity, useCorrections } from "@/lib/desk/api";
import { CATEGORIES, CATEGORY_LABEL, URGENCIES, URGENCY_LABEL, dayTime } from "@/lib/desk/labels";
import type { Category, Correction, Decision, Fact, Item, Urgency } from "@/lib/desk/types";
import { BeforeAfter, ItemIcon, NeedsYourCall, UrgencyChip, showCall, showCategory, showUrgency } from "./chips";

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-5">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

export function DecisionDiff({ before, after }: { before: Decision; after: Decision }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Category</dt>
      <dd><BeforeAfter before={showCategory(before.category)} after={showCategory(after.category)} /></dd>
      <dt className="text-muted-foreground">Urgency</dt>
      <dd><BeforeAfter before={showUrgency(before.urgency)} after={showUrgency(after.urgency)} /></dd>
      <dt className="text-muted-foreground">Who decides</dt>
      <dd><BeforeAfter before={showCall(before.managerDecides)} after={showCall(after.managerDecides)} /></dd>
    </dl>
  );
}

type Result = { correction: Correction; fact: Fact | null };

export function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-0 bg-background p-0 sm:max-w-[460px]"
      >
        {item && <ItemDetail key={item.id} item={item} />}
      </SheetContent>
    </Sheet>
  );
}

function ItemDetail({ item }: { item: Item }) {
  const { data: activity } = useActivity();
  const { data: corrections } = useCorrections();
  const [result, setResult] = useState<Result | null>(null);

  const report = useMemo(() => {
    const rows = activity?.activity ?? [];
    const received = rows.find((a) => a.type === "report.received" && (a.payload.report as { id?: string })?.id === item.reportId);
    const called = rows.find((a) => a.type === "model.called" && a.payload.reportId === item.reportId);
    return {
      text: (received?.payload.report as { rawText?: string; source?: string } | undefined)?.rawText ?? null,
      source: (received?.payload.report as { source?: string } | undefined)?.source ?? null,
      tool: (called?.payload.tool as string | null) ?? null,
      reply: ((called?.payload.input as { reply?: string } | null)?.reply as string | undefined) ?? null,
    };
  }, [activity, item.reportId]);

  const history = (corrections?.corrections ?? []).filter((c) => c.itemId === item.id);
  // What Spring It first decided: the oldest correction's "before", else the item as it stands.
  const firstDecision: Decision = history.length
    ? history[history.length - 1].before
    : { category: item.category, urgency: item.urgency, managerDecides: item.managerDecides };

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-3 px-5 pt-6 pb-4">
        <ItemIcon item={item} className="size-12" iconClassName="size-5" />
        <SheetTitle className="pr-8 text-xl leading-snug font-semibold">{item.summary}</SheetTitle>
        <SheetDescription className="text-sm">
          {[item.location, dayTime(item.createdAt), item.status === "handed_over" ? `handed over to ${item.assignee}` : null]
            .filter(Boolean)
            .join(" · ")}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5">
          <UrgencyChip urgency={item.urgency} />
          {item.managerDecides && <NeedsYourCall />}
          <span className="rounded-full bg-si-tint px-2.5 py-0.5 text-xs font-medium text-si-neutral">
            {CATEGORY_LABEL[item.category] ?? item.category}
          </span>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-3 px-3 pb-6 sm:px-4">
        <Block label={report.source === "radio" ? "Radio report" : "Report"}>
          {report.text ? (
            <p className="text-[15px] leading-relaxed">“{report.text}”</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {item.reportId ? "Report text is loading." : "Added without a spoken report."}
            </p>
          )}
        </Block>

        <Block label="What Spring It decided">
          <DecisionDiff before={firstDecision} after={firstDecision} />
          {item.kind === "contractor" && (
            <p className="mt-2 text-sm">Booked {item.assignee ?? "a contractor"}{item.dueAt ? `, due ${item.dueAt}` : ""}.</p>
          )}
          {report.reply && (
            <p className="mt-3 rounded-2xl bg-si-page px-3 py-2 text-sm">
              <span className="text-muted-foreground">Said on the radio: </span>“{report.reply}”
            </p>
          )}
        </Block>

        {/* Remount the form when the item changes underneath it, so it starts from the live values. */}
        <CorrectForm
          key={`${item.category}|${item.urgency}|${item.managerDecides}`}
          item={item}
          result={result}
          onSaved={setResult}
        />

        {history.length > 0 && (
          <Block label="Earlier corrections">
            <ul className="flex flex-col gap-4">
              {history.map((c) => (
                <li key={c.id} className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{dayTime(c.createdAt)}</span>
                  <DecisionDiff before={c.before} after={c.after} />
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </div>
  );
}

function CorrectForm({ item, result, onSaved }: { item: Item; result: Result | null; onSaved: (r: Result) => void }) {
  const [category, setCategory] = useState<Category>(item.category);
  const [urgency, setUrgency] = useState<Urgency>(item.urgency);
  const [managerDecides, setManagerDecides] = useState(item.managerDecides);
  const [fact, setFact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = category !== item.category || urgency !== item.urgency || managerDecides !== item.managerDecides;
  const canSave = (changed || fact.trim().length > 0) && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Parameters<typeof desk.correct>[1] = {};
      if (category !== item.category) body.category = category;
      if (urgency !== item.urgency) body.urgency = urgency;
      if (managerDecides !== item.managerDecides) body.managerDecides = managerDecides;
      if (fact.trim()) body.fact = fact.trim();
      const out = await desk.correct(item.id, body);
      onSaved({ correction: out.correction, fact: out.fact });
      setFact("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the correction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block label="Correct">
      {result && (
        <div className="mb-4 rounded-2xl bg-si-page p-4" role="status">
          <p className="mb-2 text-sm font-medium">Saved. Spring It will use this from the next report.</p>
          <DecisionDiff before={result.correction.before} after={result.correction.after} />
          {result.fact && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Added to memory: </span>
              {result.fact.text}
            </p>
          )}
        </div>
      )}
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger id="cat" className="w-full rounded-xl bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Urgency</Label>
          <div className="grid grid-cols-3 rounded-full bg-si-tint p-1" role="radiogroup" aria-label="Urgency">
            {URGENCIES.map((u) => (
              <button
                type="button"
                key={u}
                role="radio"
                aria-checked={urgency === u}
                onClick={() => setUrgency(u)}
                className={cn(
                  "rounded-full py-1.5 text-sm font-medium text-muted-foreground",
                  urgency === u && "bg-white text-si-text shadow-[0_1px_2px_rgba(14,37,56,0.08)]",
                  urgency === u && u === "urgent" && "bg-si-red text-white",
                )}
              >
                {URGENCY_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-si-page px-4 py-3">
          <span>
            <span className="block text-sm font-medium">Needs your call</span>
            <span className="block text-xs text-muted-foreground">The manager decides what happens next</span>
          </span>
          <Switch checked={managerDecides} onCheckedChange={setManagerDecides} />
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fact">Fact for Spring It to remember <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea
            id="fact"
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            placeholder="Bin store door is a fire door on the escape route"
            className="min-h-20 rounded-xl bg-white"
          />
        </div>
        {error && <p className="text-sm text-si-red">{error}</p>}
        <Button type="submit" disabled={!canSave} className="h-11 rounded-full">
          {busy && <Loader2 className="animate-spin" />}Save correction
        </Button>
      </form>
    </Block>
  );
}
