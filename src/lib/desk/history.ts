import type { Correction, Decision, Fact } from "./types";

/** Corrections for one item, newest first (the API already sorts newest first). */
export function itemCorrections(itemId: string, corrections: Correction[] | undefined) {
  return (corrections ?? []).filter((c) => c.itemId === itemId);
}

/** The value a field had before its most recent change, or undefined if it never changed. */
export function previous<K extends keyof Decision>(field: K, history: Correction[]): Decision[K] | undefined {
  return history.find((c) => c.before[field] !== c.after[field])?.before[field];
}

/** Older versions of a fact, newest first, by walking replacedBy links backwards. */
export function factVersions(fact: Fact, all: Fact[]) {
  const out: Fact[] = [];
  let cur: Fact | undefined = all.find((f) => f.replacedBy === fact.id);
  while (cur && out.length < 50) {
    out.push(cur);
    const id: string = cur.id;
    cur = all.find((f) => f.replacedBy === id);
  }
  return out;
}
