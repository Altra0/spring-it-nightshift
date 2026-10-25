"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity, useCorrections, useItems, useShiftId } from "@/lib/desk/api";
import { itemCorrections, previous } from "@/lib/desk/history";
import { CATEGORY_LABEL, URGENCY_LABEL, shiftLabel } from "@/lib/desk/labels";
import type { Correction, Item } from "@/lib/desk/types";
import { DeskCard, Empty, PillTabs } from "./card";
import { HeroActions } from "./actions";
import { ItemRow } from "./item-row";
import { ItemSheet } from "./item-sheet";
import { LiveDot } from "./live-dot";

type Tab = "open" | "call" | "handed_over";

export function HomeView() {
  const items = useItems();
  const activity = useActivity(50);
  const corrections = useCorrections();
  const [tab, setTab] = useState<Tab>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = items.data?.items ?? [];
  const open = all.filter((i) => i.status === "open");
  const shiftId = useShiftId(activity.data?.activity);
  const rows = (
    tab === "open" ? open : tab === "call" ? open.filter((i) => i.managerDecides) : all.filter((i) => i.status === "handed_over")
  ).slice().reverse(); // newest first
  // Re-read the selected item from the live list so the sheet shows corrections as they land.
  const selected = selectedId ? all.find((i) => i.id === selectedId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <DeskCard className="pt-8 pb-6 text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          Tonight&apos;s handover <LiveDot error={!!items.error} />
        </div>
        {items.isLoading ? (
          <Skeleton className="mx-auto mt-3 h-14 w-20 rounded-xl" />
        ) : (
          <div className="mt-2 text-6xl font-semibold tracking-tight tabular-nums">{items.error ? "–" : open.length}</div>
        )}
        <div className="mt-1 text-sm text-muted-foreground">
          {open.length === 1 ? "open item" : "open items"} · {shiftId ? `${shiftLabel(shiftId)} · ` : ""}Night shift, 7pm to 7am
        </div>
        <HeroActions shiftId={shiftId ?? ""} openCount={open.length} />
      </DeskCard>

      <DeskCard
        label="Open items"
        action={
          <PillTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "open", label: "Open" },
              { value: "call", label: "Your call" },
              { value: "handed_over", label: "Handed over" },
            ]}
          />
        }
      >
        {items.isLoading ? (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>
              </div>
            ))}
          </div>
        ) : items.error ? (
          <Empty title="Can't reach Spring It">{items.error.message}. Retrying every few seconds.</Empty>
        ) : rows.length === 0 ? (
          <Empty title={tab === "handed_over" ? "Nothing handed over yet" : tab === "call" ? "Nothing needs your call" : "No open items"}>
            {tab === "open" ? "Radio reports land here as they come in." : null}
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {rows.map((item: Item) => (
              <ItemRow key={item.id} item={item} was={wasLine(item, corrections.data?.corrections)} onOpen={(i) => setSelectedId(i.id)} />
            ))}
          </ul>
        )}
      </DeskCard>

      <ItemSheet item={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/** Grey "was …" under the urgency chip: the urgency it had, else the category. */
function wasLine(item: Item, corrections: Correction[] | undefined) {
  if (!item.corrected) return undefined;
  const history = itemCorrections(item.id, corrections);
  const u = previous("urgency", history);
  if (u) return URGENCY_LABEL[u];
  const c = previous("category", history);
  if (c) return CATEGORY_LABEL[c];
  const m = previous("managerDecides", history);
  return m === undefined ? undefined : m ? "your call" : "team's call";
}
