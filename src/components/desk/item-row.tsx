import { time } from "@/lib/desk/labels";
import type { Item } from "@/lib/desk/types";
import { ItemIcon, NeedsYourCall, UrgencyChip } from "./chips";

/** `was` is the grey line under the urgency chip on a corrected row, e.g. "was Low". */
export function ItemRow({ item, was, onOpen }: { item: Item; was?: string; onOpen: (item: Item) => void }) {
  const sub = [item.location, item.kind === "contractor" && item.dueAt ? `due ${item.dueAt}` : null, time(item.createdAt)]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <button
        onClick={() => onOpen(item)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-si-page focus-visible:bg-si-page focus-visible:outline-none"
      >
        <ItemIcon item={item} className="size-10" iconClassName="size-[18px]" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium leading-snug sm:line-clamp-1">{item.summary}</span>
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {sub}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
          {item.managerDecides && <NeedsYourCall />}
          <span className="flex flex-col items-end gap-0.5">
            <UrgencyChip urgency={item.urgency} />
            {was && <span className="text-xs text-muted-foreground">was {was}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
