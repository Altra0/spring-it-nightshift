"use client";

import { useState } from "react";
import { ArrowUpRight, BookMarked, Building2, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, type Replay, type ReplayAnswer, replay, useActivity, useCorrections, useFacts, useItems, useStats } from "@/lib/desk/api";
import { dayTime, itemTitle, time } from "@/lib/desk/labels";
import { SIGNED_IN } from "@/lib/desk/session";
import type { Category, Fact, Urgency } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { DeskCard, Empty, PageTitle } from "./card";
import { KeyValueCard, SwapIcon, showCall, showCategory, showUrgency } from "./chips";
import { LiveDot } from "./live-dot";

const MUBIT_TASK = "Spring It 3";
const MUBIT_MODEL = "claude-haiku-4-5";
const MUBIT_CONSOLE =
  "https://app.mubit.ai/console/projects/ws-3e092efdb35494e4/workloads/ln_507d3bbdb331f9a0cb85d63e";

function Disc({ children }: { children: React.ReactNode }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-si-tint text-si-neutral">{children}</span>;
}

/** Card 1: knowledge versions. v1 is the onboarding set; every later fact is a new version. */
function Knowledge() {
  const facts = useFacts();
  const all = facts.data?.facts ?? [];
  const seed = all.filter((f) => f.source === "seed");
  const later = all.filter((f) => f.source !== "seed").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const versions = later.map((f, i) => ({ fact: f, v: i + 2, was: all.find((x) => x.replacedBy === f.id) as Fact | undefined })).reverse();

  return (
    <DeskCard label="What Spring It knows" action={<span className="text-sm text-muted-foreground">v{later.length + 1}</span>}>
      {facts.isLoading ? (
        <div className="space-y-3 py-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : facts.error && !facts.data ? (
        <Empty title="Can't reach Spring It">{facts.error.message}. Retrying every few seconds.</Empty>
      ) : (
        <ul className="flex flex-col">
          {versions.map(({ fact, v, was }) => (
            <li key={fact.id} className="flex items-center gap-3 py-2.5">
              {was ? <SwapIcon /> : <Disc><BookMarked className="size-[18px]" /></Disc>}
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{fact.text}</span>
                <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                  v{v} · {SIGNED_IN.name} · {time(fact.createdAt)}{was ? ` · was: ${was.text}` : ""}
                </span>
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3 py-2.5">
            <Disc><Building2 className="size-[18px]" /></Disc>
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug">Onboarded from building SOPs</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                v1 · {seed.length} {seed.length === 1 ? "fact" : "facts"}{seed[0] ? ` · ${dayTime(seed[0].createdAt)}` : ""}
              </span>
            </span>
          </li>
        </ul>
      )}
    </DeskCard>
  );
}

function AnswerColumn({ label, a, other }: { label: string; a: ReplayAnswer; other: ReplayAnswer }) {
  const diff = (k: keyof ReplayAnswer) => a[k] !== other[k];
  const row = (name: string, value: string, changed: boolean) => (
    <div className="flex flex-col py-2.5">
      <span className="text-xs text-muted-foreground">{name}</span>
      <span className={cn("text-sm", changed ? "font-semibold" : "text-si-was")}>{value}</span>
    </div>
  );
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-si-page px-4 py-3">
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="divide-y divide-border">
        {row("Category", a.category ? showCategory(a.category as Category) : "None", diff("category"))}
        {row("Urgency", a.urgency ? showUrgency(a.urgency as Urgency) : "None", diff("urgency"))}
        {row("Who decides", a.managerDecides === null ? "None" : showCall(a.managerDecides), diff("managerDecides"))}
        {row("Spring It says", `“${a.reply}”`, diff("reply"))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{a.factsUsed} {a.factsUsed === 1 ? "fact" : "facts"} in memory</p>
    </div>
  );
}

/** Card 2: the same radio words, answered with memory as it was and memory now. */
function BeforeAfter() {
  const corrections = useCorrections();
  const items = useItems();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; r: Replay } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemById = new Map((items.data?.items ?? []).map((i) => [i.id, i]));
  const list = (corrections.data?.corrections ?? []).filter((c) => itemById.has(c.itemId));
  const selected = list.find((c) => c.id === picked) ?? list[0];

  async function run() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      setResult({ id: selected.id, r: await replay(selected.id) });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Replay isn't on this server yet." : err instanceof Error ? err.message : "Replay failed.");
    } finally {
      setBusy(false);
    }
  }

  const shown = result && selected && result.id === selected.id ? result.r : null;

  return (
    <DeskCard label="Before and after">
      {corrections.isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <Empty title="No corrections yet">Correct an item on Home, then replay it here.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {list.slice(0, 6).map((c) => {
              const item = itemById.get(c.itemId)!;
              return (
                <button
                  key={c.id}
                  onClick={() => setPicked(c.id)}
                  className={cn(
                    "max-w-full truncate rounded-full px-3.5 py-1.5 text-sm font-medium",
                    selected?.id === c.id ? "bg-si-neutral text-white" : "bg-si-tint text-si-text",
                  )}
                >
                  {itemTitle(item)}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Sends the same radio words to Spring It twice: once with this building&apos;s memory as it was before {SIGNED_IN.name}&apos;s correction, once with memory now.
          </p>
          <Button onClick={run} disabled={busy || !selected} className="h-11 rounded-full">
            {busy ? <Loader2 className="animate-spin" /> : <Play />}Replay
          </Button>
          {error && <p className="text-sm text-si-red">{error}</p>}
          {shown && (
            <>
              <p className="rounded-2xl bg-si-page px-4 py-3 text-[15px]">“{shown.text}”</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <AnswerColumn label="Memory before the correction" a={shown.before} other={shown.after} />
                <AnswerColumn label="Memory now" a={shown.after} other={shown.before} />
              </div>
            </>
          )}
        </div>
      )}
    </DeskCard>
  );
}

/** Card 3: what Mubit is collecting for this building. No claim of a trained model. */
function MubitCard() {
  const stats = useStats();
  // Count from the activity log only if the stats endpoint is not deployed yet.
  const activity = useActivity(5000, !!stats.error);
  const counted = (activity.data?.activity ?? []).filter((a) => a.type === "model.called").length;
  const calls = stats.data?.modelCalls ?? (activity.data ? counted : null);
  return (
    <DeskCard label="Mubit, this building">
      <KeyValueCard
        className="-mt-2 px-0"
        rows={[
          { label: "Task", value: stats.data?.task ?? MUBIT_TASK },
          { label: "Model", value: stats.data?.model ?? MUBIT_MODEL },
          { label: "Calls sent for this building", value: calls === null ? "…" : calls.toLocaleString("en-GB") },
          { label: "Status", value: "Queued to train this building's model" },
        ]}
      />
      <a
        href={MUBIT_CONSOLE}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-between rounded-2xl bg-si-page px-4 py-3.5 text-sm font-medium hover:bg-si-tint"
      >
        Open this task in the Mubit console
        <ArrowUpRight className="size-4 text-muted-foreground" />
      </a>
    </DeskCard>
  );
}

export function ModelView() {
  const facts = useFacts();
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="This building's model"
        sub={<>Your corrections change how Spring It answers for Spring Court. Mubit collects these calls to train this building&apos;s own model. <LiveDot error={!!facts.error && !facts.data} /></>}
      />
      <Knowledge />
      <BeforeAfter />
      <MubitCard />
    </div>
  );
}
