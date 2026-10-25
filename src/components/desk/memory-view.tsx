"use client";

import { useState } from "react";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { desk, useActivity, useFacts, useShiftId } from "@/lib/desk/api";
import { dayTime } from "@/lib/desk/labels";
import type { Fact } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { DeskCard, Empty, PageTitle } from "./card";
import { LiveDot } from "./live-dot";

const sourceLabel = (f: Fact) => (f.source === "seed" ? "Set up with the building" : "Added by the manager");

function FactRow({ fact, byId, onReplace }: { fact: Fact; byId: Map<string, Fact>; onReplace?: (f: Fact) => void }) {
  const replaced = fact.status === "replaced";
  const successor = fact.replacedBy ? byId.get(fact.replacedBy) : undefined;
  const predecessor = [...byId.values()].find((f) => f.replacedBy === fact.id);
  return (
    <li id={fact.id} className="flex scroll-mt-20 gap-3 py-3 target:rounded-2xl target:bg-si-marker/30">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", replaced ? "bg-si-tint text-muted-foreground" : "bg-si-neutral/10 text-si-neutral")}>
        <BookMarked className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug", replaced ? "text-muted-foreground line-through decoration-si-red/60" : "font-medium")}>{fact.text}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {sourceLabel(fact)} · {dayTime(fact.createdAt)}
        </p>
        {replaced && successor && (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Replaced by </span>
            <a href={`#${successor.id}`} className="font-medium underline decoration-si-marker decoration-2 underline-offset-2">{successor.text}</a>
          </p>
        )}
        {!replaced && predecessor && (
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Replaces </span>
            <a href={`#${predecessor.id}`} className="text-muted-foreground line-through decoration-si-red/60">{predecessor.text}</a>
          </p>
        )}
      </div>
      {onReplace && (
        <Button variant="secondary" size="sm" className="shrink-0 rounded-full" onClick={() => onReplace(fact)}>
          Replace
        </Button>
      )}
    </li>
  );
}

export function MemoryView() {
  const facts = useFacts();
  const activity = useActivity(50);
  const shiftId = useShiftId(activity.data?.activity);
  const [editing, setEditing] = useState<{ fact: Fact | null } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = facts.data?.facts ?? [];
  const byId = new Map(all.map((f) => [f.id, f]));
  const active = all.filter((f) => f.status === "active").reverse();
  const replaced = all.filter((f) => f.status === "replaced").reverse();

  function open(fact: Fact | null) {
    setText("");
    setError(null);
    setEditing({ fact });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.fact) await desk.replaceFact(editing.fact.id, text.trim(), shiftId ?? "");
      else await desk.addFact(text.trim(), shiftId ?? "");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Memory"
        sub={<>What Spring It knows about Spring Court. Read on every report. Nothing is deleted. <LiveDot error={!!facts.error} /></>}
      />
      <DeskCard
        label="In use"
        action={
          <Button size="sm" className="rounded-full" onClick={() => open(null)}>
            <Plus />Add fact
          </Button>
        }
      >
        {facts.isLoading ? (
          <div className="space-y-3 py-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : facts.error ? (
          <Empty title="Can't reach Spring It">{facts.error.message}. Retrying every few seconds.</Empty>
        ) : active.length === 0 ? (
          <Empty title="No facts yet">Facts come from corrections, or add one here.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((f) => <FactRow key={f.id} fact={f} byId={byId} onReplace={(x) => open(x)} />)}
          </ul>
        )}
      </DeskCard>
      {replaced.length > 0 && (
        <DeskCard label="Replaced, kept for the record">
          <ul className="divide-y divide-border">
            {replaced.map((f) => <FactRow key={f.id} fact={f} byId={byId} />)}
          </ul>
        </DeskCard>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="rounded-3xl border-0">
          <DialogHeader>
            <DialogTitle>{editing?.fact ? "Replace fact" : "Add fact"}</DialogTitle>
            <DialogDescription>
              {editing?.fact ? (
                <>The old fact stays in memory, struck through, linked to the new one: <s>{editing.fact.text}</s></>
              ) : (
                "Something about Spring Court that Spring It should use on every report."
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Side gate locked for scaffolding until 12 Nov"
            className="min-h-24 rounded-xl"
          />
          {error && <p className="text-sm text-si-red">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="rounded-full" disabled={busy || !text.trim()} onClick={save}>
              {busy && <Loader2 className="animate-spin" />}
              {editing?.fact ? "Replace" : "Save fact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
