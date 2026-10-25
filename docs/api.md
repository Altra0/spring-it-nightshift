# Spring It agent API (stable contract)

Other streams (UI, radio/voice, data/seed) build against this. Changes must be
additive. All bodies are JSON. Errors are `{ "error": string }` with 400/404, or
502 when the model call fails.

## Types

```ts
type Category = "fire_safety" | "security" | "access" | "maintenance" | "cleaning"
              | "noise" | "resident_welfare" | "contractor" | "other";
type Urgency = "low" | "normal" | "urgent";

type Item = {
  id: string; shiftId: string; reportId: string | null;
  kind: "report" | "contractor" | "note";
  summary: string; category: Category; location: string | null;
  urgency: Urgency; managerDecides: boolean;
  status: "open" | "handed_over" | "closed";
  assignee: string | null;   // contractor trade, or "Datte Bayo" after handover
  dueAt: string | null;      // contractor due time, as spoken
  corrected: boolean; createdAt: string;
};

type Fact = {
  id: string; buildingId: string; text: string;
  status: "active" | "replaced"; replacedBy: string | null;
  source: "correction" | "seed"; createdAt: string;
};
```

## Endpoints

### `POST /api/report`
`{ text: string, shiftId: string, source?: "radio" | "text" }` (source defaults to `text`)

-> `{ item: Item | null, reply: string, action: "logReport" | "scheduleContractor" | "addHandoverItem" | "handOver", handover?: { items: Item[], accepted: boolean, to: string } }`

`reply` is one short radio-style sentence for the radio page to speak. `item` is
null only for `handOver` (spoken "End of shift, hand over."), which then fills `handover`.

### `GET /api/items?status=open|handed_over|closed`
-> `{ items: Item[] }` (oldest first; no status = all)

### `POST /api/items/:id/correct`
`{ category?: Category, urgency?: Urgency, managerDecides?: boolean, fact?: string }`

-> `{ item: Item, fact: Fact | null, correction: { id, itemId, before, after, factId, mubitAccepted: boolean | null, createdAt } }`

`before`/`after` are `{ category, urgency, managerDecides }`. `fact` becomes
building memory used on every later call. `mubitAccepted` is the Mubit control
API result (null = not sent; off by default since that route 404s).

### `GET /api/facts` (active only), `GET /api/facts?all=1` (with replaced)
-> `{ facts: Fact[] }`

### `POST /api/facts/:id/replace`
`{ text: string, shiftId?: string }` -> `{ fact: Fact, replaced: Fact }`

The old fact is kept with `status: "replaced"` and `replacedBy` = new id.

### `POST /api/handover`
`{ shiftId: string, to?: string }` (to defaults to "Datte Bayo") -> `{ items: Item[], accepted: boolean, to: string }`

### `GET /api/activity?limit=200`
-> `{ activity: { seq, at, shiftId, type, payload }[] }` newest first. Types:
`report.received`, `model.called`, `item.created`, `item.corrected`, `fact.created`,
`fact.replaced`, `contractor.scheduled`, `handover.completed`, `mubit.step_outcome`.
`model.called` payload carries `model`, `tool`, `input`, `factsUsed`, `correctionsUsed`, `ms`.

### `GET /api/corrections`
-> `{ corrections: Correction[] }` newest first, for the "before / after" screen.

### `POST /api/dev/reset`
Wipes and re-seeds. For rehearsals. Disabled in production unless `ALLOW_RESET=1`.
