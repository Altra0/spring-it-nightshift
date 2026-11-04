import { createElement } from "react";
import { ArrowLeftRight } from "lucide-react";
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

/** Revolut-style white key-value card: label left, bold value right, grey previous value underneath. */
export function KeyValueCard({ rows, className }: { rows: { label: string; value: React.ReactNode; was?: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border rounded-3xl bg-card px-5", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-4 py-3.5">
          <dt className="text-sm text-muted-foreground">{r.label}</dt>
          <dd className="text-right">
            <span className="block text-sm font-medium">{r.value}</span>
            {r.was !== undefined && <span className="block text-xs text-si-was">was {r.was}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Round swap icon from Revolut's exchange rows: marks something that was updated. */
export function SwapIcon({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-si-neutral/10 text-si-neutral", className)}>
      <ArrowLeftRight className="size-[18px]" />
    </span>
  );
}
