"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCorrections, useFacts, useItems } from "@/lib/desk/api";
import { itemTitle, time } from "@/lib/desk/labels";
import type { Correction } from "@/lib/desk/types";
import { DeskCard, Empty, PageTitle } from "./card";
import { SwapIcon, showCall, showCategory, showUrgency } from "./chips";
import { ItemSheet } from "./item-sheet";
import { LiveDot } from "./live-dot";

/** The previous values of whatever changed, e.g. "Security, Normal". */
export function wasValues(c: Pick<Correction, "before" | "after">) {
  return [
    c.before.category !== c.after.category && showCategory(c.before.category),
    c.before.urgency !== c.after.urgency && showUrgency(c.before.urgency),
    c.before.managerDecides !== c.after.managerDecides && showCall(c.before.managerDecides).toLowerCase(),
  ]
    .filter(Boolean)
    .join(", ");
}

export function CorrectionsView() {
  const corrections = useCorrections();
  const items = useItems();
  const facts = useFacts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const itemById = new Map((items.data?.items ?? []).map((i) => [i.id, i]));
  const factById = new Map((facts.data?.facts ?? []).map((f) => [f.id, f]));
  const rows = corrections.data?.corrections ?? [];
  const selected = selectedId ? itemById.get(selectedId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Corrections" sub={<>Every time you changed what Spring It decided. <LiveDot error={!!corrections.error} /></>} />
      <DeskCard label="Your corrections">
        {corrections.isLoading ? (
          <div className="space-y-3 py-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : corrections.error && !corrections.data ? (
          <Empty title="Can't reach Spring It">{corrections.error.message}. Retrying every few seconds.</Empty>
        ) : rows.length === 0 ? (
          <Empty title="No corrections yet">Open an item on Home and use Correct.</Empty>
        ) : (
          <ul className="flex flex-col">
            {rows.map((c) => {
              const item = itemById.get(c.itemId);
              const fact = c.factId ? factById.get(c.factId) : undefined;
              const was = wasValues(c);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => item && setSelectedId(item.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-si-page"
                  >
                    <SwapIcon />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-snug sm:line-clamp-1">{item ? itemTitle(item) : "Item"}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        Updated {time(c.createdAt)}{was ? ` · was: ${was}` : ""}
                      </span>
                      {fact && <span className="block truncate text-sm text-muted-foreground">Remembered: {fact.text}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold">{showCategory(c.after.category)}</span>
                      <span className="block text-xs text-muted-foreground">{showUrgency(c.after.urgency)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DeskCard>
      <ItemSheet item={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
