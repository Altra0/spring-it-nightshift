"use client";

import { useState } from "react";
import { BookMarked, ChevronRight, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { desk, useActivity, useFacts, useShiftId } from "@/lib/desk/api";
import { factVersions } from "@/lib/desk/history";
import { dayTime, time } from "@/lib/desk/labels";
import type { Fact } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { DeskCard, Empty, PageTitle } from "./card";
import { KeyValueCard, SwapIcon } from "./chips";
import { LiveDot } from "./live-dot";

const sourceLabel = (f: Fact) => (f.source === "seed" ? "Set up with the building" : "Added by the manager");

function FactRow({ fact, was, onOpen }: { fact: Fact; was?: Fact; onOpen: (f: Fact) => void }) {
  return (
    <li>
      <button
        onClick={() => onOpen(fact)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-si-page"
      >
        {was ? (
          <SwapIcon />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-si-tint text-si-neutral">
            <BookMarked className="size-[18px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug">{fact.text}</span>
          <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {was ? `Updated ${time(fact.createdAt)} · was: ${was.text}` : `${sourceLabel(fact)} · ${dayTime(fact.createdAt)}`}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

function FactSheet({ fact, all, onClose, onUpdate }: { fact: Fact | null; all: Fact[]; onClose: () => void; onUpdate: (f: Fact) => void }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const versions = fact ? factVersions(fact, all) : [];
  return (
    <Sheet open={!!fact} onOpenChange={(v) => { if (!v) { onClose(); setShowEarlier(false); } }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-0 bg-background p-0 sm:max-w-[460px]">
        {fact && (
          <>
            <SheetHeader className="gap-3 px-5 pt-6 pb-4">
              {versions.length ? <SwapIcon className="size-12" /> : (
                <span className="flex size-12 items-center justify-center rounded-full bg-si-tint text-si-neutral"><BookMarked className="size-5" /></span>
              )}
              <SheetTitle className="pr-8 text-xl leading-snug font-semibold">{fact.text}</SheetTitle>
              <SheetDescription>Spring It reads this on every report.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-3 pb-6 sm:px-4">
              <KeyValueCard
                rows={[
                  { label: "Status", value: "In use" },
                  { label: "Source", value: sourceLabel(fact) },
                  { label: versions.length ? "Updated" : "Added", value: dayTime(fact.createdAt) },
                  ...(versions[0] ? [{ label: "Previous", value: versions[0].text }] : []),
                ]}
              />
              <Button className="h-11 rounded-full" onClick={() => onUpdate(fact)}>Update fact</Button>
              {versions.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="px-2 pt-2 text-sm font-medium text-muted-foreground">Earlier</h3>
                  <button
                    onClick={() => setShowEarlier((v) => !v)}
                    aria-expanded={showEarlier}
                    className="flex items-center justify-between rounded-3xl bg-card px-5 py-4 text-left font-medium"
                  >
                    Previous versions
                    <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                      {versions.length}
                      <ChevronRight className={cn("size-4 transition-transform", showEarlier && "rotate-90")} />
                    </span>
                  </button>
                  {showEarlier && versions.map((v) => (
                    <KeyValueCard
                      key={v.id}
                      rows={[
                        { label: "Fact", value: v.text },
                        { label: "Source", value: sourceLabel(v) },
                        { label: "Added", value: dayTime(v.createdAt) },
                      ]}
                    />
                  ))}
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function MemoryView() {
  const facts = useFacts();
  const activity = useActivity(50);
  const shiftId = useShiftId(activity.data?.activity);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ fact: Fact | null } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = facts.data?.facts ?? [];
  const active = all.filter((f) => f.status === "active").reverse();
  const opened = openId ? all.find((f) => f.id === openId) ?? null : null;

  function edit(fact: Fact | null) {
    setText("");
    setError(null);
    setEditing({ fact });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.fact) {
        const r = await desk.replaceFact(editing.fact.id, text.trim(), shiftId ?? "");
        if (openId) setOpenId(r.fact.id); // follow the fact to its new version
      } else {
        await desk.addFact(text.trim(), shiftId ?? "");
      }
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
        sub={<>What Spring It knows about Spring Court. Updated facts keep their earlier versions. <LiveDot error={!!facts.error} /></>}
      />
      <DeskCard
        label="Facts in use"
        action={
          <Button size="sm" className="rounded-full" onClick={() => edit(null)}>
            <Plus />Add fact
          </Button>
        }
      >
        {facts.isLoading ? (
          <div className="space-y-3 py-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : facts.error && !facts.data ? (
          <Empty title="Can't reach Spring It">{facts.error.message}. Retrying every few seconds.</Empty>
        ) : active.length === 0 ? (
          <Empty title="No facts yet">Facts come from corrections, or add one here.</Empty>
        ) : (
          <ul className="flex flex-col">
            {active.map((f) => (
              <FactRow key={f.id} fact={f} was={all.find((x) => x.replacedBy === f.id)} onOpen={(x) => setOpenId(x.id)} />
            ))}
          </ul>
        )}
      </DeskCard>

      <FactSheet fact={opened} all={all} onClose={() => setOpenId(null)} onUpdate={(f) => edit(f)} />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="rounded-3xl border-0">
          <DialogHeader>
            <DialogTitle>{editing?.fact ? "Update fact" : "Add fact"}</DialogTitle>
            <DialogDescription>
              {editing?.fact
                ? `Currently: ${editing.fact.text}. The current wording is kept under Earlier.`
                : "Something about Spring Court that Spring It should use on every report."}
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
              {editing?.fact ? "Update" : "Save fact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
