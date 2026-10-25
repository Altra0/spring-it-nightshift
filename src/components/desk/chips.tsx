import { createElement } from "react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, URGENCY_LABEL, iconTone, itemIcon } from "@/lib/desk/labels";
import type { Category, Item, Urgency } from "@/lib/desk/types";

export function UrgencyChip({ urgency, className }: { urgency: Urgency; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        urgency === "urgent" && "bg-si-red text-white",
        urgency === "normal" && "bg-si-tint text-si-neutral",
        urgency === "low" && "bg-transparent text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      {URGENCY_LABEL[urgency]}
    </span>
  );
}

export function NeedsYourCall({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-si-marker px-2.5 py-0.5 text-xs font-medium text-si-text", className)}>
      Needs your call
    </span>
  );
}

/** One decision field shown before -> after, the old value struck through. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  if (before === after) return <span className="font-medium">{after}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <s className="text-muted-foreground decoration-si-red/70">{before}</s>
      <span aria-hidden className="text-muted-foreground">→</span>
      <span className="font-medium">{after}</span>
    </span>
  );
}

export const showCategory = (c: Category) => CATEGORY_LABEL[c] ?? c;
export const showUrgency = (u: Urgency) => URGENCY_LABEL[u] ?? u;
export const showCall = (b: boolean) => (b ? "Needs your call" : "Team handles it");

/** Round category icon disc used in rows and the detail sheet. */
export function ItemIcon({ item, className, iconClassName }: { item: Pick<Item, "category" | "summary" | "location">; className?: string; iconClassName?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full", iconTone(item.category), className)}>
      {createElement(itemIcon(item), { className: iconClassName })}
    </span>
  );
}
