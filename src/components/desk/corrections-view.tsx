"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCorrections, useFacts, useItems } from "@/lib/desk/api";
import { dayTime } from "@/lib/desk/labels";
import { DeskCard, Empty, PageTitle } from "./card";
import { ItemIcon } from "./chips";
import { DecisionDiff, ItemSheet } from "./item-sheet";
import { LiveDot } from "./live-dot";

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
      <PageTitle title="Corrections" sub={<>Every time the manager changed what Spring It decided. <LiveDot error={!!corrections.error} /></>} />
      <DeskCard label="Before and after">
        {corrections.isLoading ? (
          <div className="space-y-3 py-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : corrections.error ? (
          <Empty title="Can't reach Spring It">{corrections.error.message}. Retrying every few seconds.</Empty>
        ) : rows.length === 0 ? (
          <Empty title="No corrections yet">Open an item on Home and use Correct.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => {
              const item = itemById.get(c.itemId);
              const fact = c.factId ? factById.get(c.factId) : undefined;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => item && setSelectedId(item.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] gap-3 rounded-2xl px-2 py-3 text-left hover:bg-si-page"
                  >
                    {item && <ItemIcon item={{ ...item, category: c.after.category }} className="size-10" iconClassName="size-[18px]" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{item?.summary ?? "Item"}</p>
                      <p className="mb-2 text-sm text-muted-foreground">
                        {[item?.location, dayTime(c.createdAt)].filter(Boolean).join(" · ")}
                      </p>
                      <DecisionDiff before={c.before} after={c.after} />
                      {fact && (
                        <p className="mt-2 rounded-2xl bg-si-page px-3 py-2 text-sm">
                          <span className="text-muted-foreground">Remembered: </span>
                          <span className={fact.status === "replaced" ? "line-through decoration-si-red/60" : ""}>{fact.text}</span>
                        </p>
                      )}
                    </div>
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
