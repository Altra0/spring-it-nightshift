// Client-side shapes of the agent API (docs/api.md). Dates arrive as ISO strings.
export type Category =
  | "fire_safety" | "security" | "access" | "maintenance" | "cleaning"
  | "noise" | "resident_welfare" | "contractor" | "other";
export type Urgency = "low" | "normal" | "urgent";

export type Item = {
  id: string; shiftId: string; reportId: string | null;
  kind: "report" | "contractor" | "note";
  title?: string; summary: string; category: Category; location: string | null;
  urgency: Urgency; managerDecides: boolean;
  status: "open" | "handed_over" | "closed";
  assignee: string | null; dueAt: string | null;
  corrected: boolean; createdAt: string;
};

export type Fact = {
  id: string; buildingId: string; text: string;
  status: "active" | "replaced"; replacedBy: string | null;
  source: "correction" | "seed"; createdAt: string;
};

export type Decision = { category: Category; urgency: Urgency; managerDecides: boolean };

export type Correction = {
  id: string; itemId: string; before: Decision; after: Decision;
  factId: string | null; mubitAccepted: boolean | null; createdAt: string;
};

export type Activity = {
  seq: number; at: string; shiftId: string | null; type: string;
  payload: Record<string, unknown>;
};
