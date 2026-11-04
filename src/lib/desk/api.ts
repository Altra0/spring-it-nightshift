"use client";

import { useSyncExternalStore } from "react";
import useSWR, { mutate } from "swr";
import type { Activity, Correction, Fact, Item } from "./types";

/** Radio reports should show up on the desk within a few seconds. */
export const POLL_MS = 3000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const fetcher = <T,>(path: string) => request<T>(path);
const poll = { refreshInterval: POLL_MS, revalidateOnFocus: true, keepPreviousData: true };

export function useItems(status?: Item["status"]) {
  return useSWR<{ items: Item[] }>(status ? `/api/items?status=${status}` : "/api/items", fetcher, poll);
}
export function useFacts() {
  return useSWR<{ facts: Fact[] }>("/api/facts?all=1", fetcher, poll);
}
export function useCorrections() {
  return useSWR<{ corrections: Correction[] }>("/api/corrections", fetcher, poll);
}
export function useActivity(limit = 200, enabled = true) {
  return useSWR<{ activity: Activity[] }>(enabled ? `/api/activity?limit=${limit}` : null, fetcher, poll);
}

/** After any write, refresh every desk view at once. */
function refreshAll() {
  return mutate((key) => typeof key === "string" && key.startsWith("/api/"));
}

async function write<T>(path: string, body: unknown) {
  const out = await request<T>(path, body);
  await refreshAll();
  return out;
}

export const desk = {
  correct: (id: string, body: { category?: string; urgency?: string; managerDecides?: boolean; fact?: string }) =>
    write<{ item: Item; fact: Fact | null; correction: Correction }>(`/api/items/${id}/correct`, body),
  report: (text: string, shiftId: string) =>
    write<{ item: Item | null; reply: string; action: string }>("/api/report", { text, shiftId, source: "text" }),
  handOver: (shiftId: string) =>
    write<{ items: Item[]; accepted: boolean; to: string }>("/api/handover", { shiftId }),
  addFact: (text: string, shiftId: string) => write<{ fact: Fact }>("/api/facts", { text, shiftId }),
  replaceFact: (id: string, text: string, shiftId: string) =>
    write<{ fact: Fact; replaced: Fact }>(`/api/facts/${id}/replace`, { text, shiftId }),
};

const noop = () => () => {};
const todayShiftId = () => `night-${new Date().toISOString().slice(0, 10)}`;

/** Tonight's shift: the one the latest activity belongs to, else the
 *  `night-YYYY-MM-DD` id the radio and demo script use. The date fallback is
 *  read after mount, so prerendering never sees the clock. */
export function useShiftId(activity: Activity[] | undefined) {
  const today = useSyncExternalStore(noop, todayShiftId, () => null);
  return activity?.find((a) => a.shiftId)?.shiftId ?? today;
}

const londonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const todayKey = () => londonDay(new Date());

/** Today's date in London as YYYY-MM-DD, read on the client only. */
export function useToday() {
  return useSyncExternalStore(noop, todayKey, () => null);
}
export { londonDay };

export type ReplayAnswer = {
  tool: string; category: string | null; urgency: string | null; managerDecides: boolean | null;
  reply: string; model: string; factsUsed: number;
};
export type Replay = { text: string; before: ReplayAnswer; after: ReplayAnswer };

export type KnowledgeVersion = {
  version: number; kind: "correction" | "fact_update"; text: string; replacedText?: string;
  itemTitle?: string; correctionId?: string; by: string; at: string;
};
export function useKnowledge() {
  return useSWR<{ onboarded: { version: number; label: string; factCount: number; at: string | null }; versions: KnowledgeVersion[]; current: number }>(
    "/api/knowledge", fetcher, poll);
}

export function useStats() {
  return useSWR<{ modelCalls: number; model: string; task: string; status?: string; consoleUrl?: string }>("/api/stats", fetcher, { ...poll, shouldRetryOnError: false });
}

/** Runs the corrected report again with memory as it was, and memory now. */
export const replay = (correctionId: string) => request<Replay>("/api/replay", { correctionId });
