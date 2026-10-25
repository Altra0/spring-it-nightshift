"use client";

import { useState } from "react";
import { BookPlus, Loader2, Mic, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { desk } from "@/lib/desk/api";

type Kind = "handover" | "fact" | "report";

/** Light-tinted round action under the hero number. */
function Action({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1.5 text-sm font-medium">
      <span className="flex size-12 items-center justify-center rounded-full bg-si-tint text-si-neutral transition-colors group-hover:bg-si-neutral group-hover:text-white">
        <Icon className="size-5" />
      </span>
      {label}
    </button>
  );
}

export function HeroActions({ shiftId, openCount }: { shiftId: string; openCount: number }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function show(kind: Kind) {
    setText("");
    setNote(null);
    setError(null);
    setOpen(kind);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (open === "handover") {
        const r = await desk.handOver(shiftId);
        setNote(`${r.items.length} ${r.items.length === 1 ? "item" : "items"} handed over to ${r.to}${r.accepted ? ", accepted." : "."}`);
      } else if (open === "fact") {
        const r = await desk.addFact(text.trim(), shiftId);
        setNote(`Saved to memory: ${r.fact.text}`);
        setText("");
      } else if (open === "report") {
        const r = await desk.report(text.trim(), shiftId);
        setNote(`Spring It: “${r.reply}”`);
        setText("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const copy = {
    handover: {
      title: "Hand over",
      desc: openCount
        ? `Every open item on the handover list goes to the day manager. ${openCount} open now.`
        : "There are no open items on the handover list.",
      cta: "Hand over",
    },
    fact: { title: "Add fact", desc: "Something about Spring Court that Spring It should use on every report.", cta: "Save fact" },
    report: { title: "Log report", desc: "Type a report as it would come over the radio.", cta: "Log report" },
  } as const;
  const c = open ? copy[open] : null;
  const needsText = open === "fact" || open === "report";

  return (
    <>
      <div className="mt-6 flex justify-center gap-8 sm:gap-10">
        <Action icon={Send} label="Hand over" onClick={() => show("handover")} />
        <Action icon={BookPlus} label="Add fact" onClick={() => show("fact")} />
        <Action icon={Mic} label="Log report" onClick={() => show("report")} />
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="rounded-3xl border-0">
          {c && (
            <>
              <DialogHeader>
                <DialogTitle>{c.title}</DialogTitle>
                <DialogDescription>{c.desc}</DialogDescription>
              </DialogHeader>
              {needsText && (
                <Textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={open === "fact" ? "Side gate locked for scaffolding until 12 Nov" : "Concierge to base. Bin store door's propped open again."}
                  className="min-h-24 rounded-xl"
                />
              )}
              {note && <p className="rounded-2xl bg-si-page px-4 py-3 text-sm" role="status">{note}</p>}
              {error && <p className="text-sm text-si-red">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" className="rounded-full" onClick={() => setOpen(null)}>
                  {note ? "Done" : "Cancel"}
                </Button>
                {!(open === "handover" && note) && (
                  <Button
                    className="rounded-full"
                    disabled={busy || (needsText ? !text.trim() : openCount === 0)}
                    onClick={run}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    {c.cta}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
