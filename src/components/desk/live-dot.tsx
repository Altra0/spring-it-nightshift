import { cn } from "@/lib/utils";

/** Small pulse showing the desk is polling the API. */
export function LiveDot({ error }: { error?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal" title={error ? "Reconnecting" : "Live"}>
      <span className="relative flex size-2">
        {!error && <span className="absolute inline-flex size-full animate-ping rounded-full bg-si-green opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", error ? "bg-si-red" : "bg-si-green")} />
      </span>
      {error ? "Reconnecting" : "Live"}
    </span>
  );
}
