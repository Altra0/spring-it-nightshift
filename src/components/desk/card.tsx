import { cn } from "@/lib/utils";

/** White rounded card with the small grey section label above, Revolut style. */
export function DeskCard({
  label, action, className, children,
}: { label?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgba(14,37,56,0.04)]", className)}>
      {(label || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {label && <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 px-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Pill tabs (segmented, grey track, white active pill). */
export function PillTabs<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full bg-si-tint p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
            value === o.value && "bg-white text-si-text shadow-[0_1px_2px_rgba(14,37,56,0.08)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
