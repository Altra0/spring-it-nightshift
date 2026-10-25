# Architecture

```
src/
  app/api/...            Route handlers (the contract in docs/api.md). Thin: parse, call a service.
  app/page.tsx           Placeholder. Screens belong to the UI stream (put them under src/app/).
  db/schema.ts           Drizzle tables: buildings, locations, facts, shifts, reports, items, corrections, activity.
  db/bootstrap.sql.ts    Idempotent DDL run on first connection (no migration step).
  db/seed.ts             Minimal seed (Spring Court, locations, two facts). Data stream extends this.
  db/client.ts           Neon (DATABASE_URL) or embedded PGlite (.data/pglite) when unset.
  lib/agent/prompt.ts    FROZEN system prompt + buildUserMessage (facts, corrections, report).
  lib/agent/tools.ts     FROZEN tool set: logReport, scheduleContractor, addHandoverItem, handOver.
  lib/agent/model.ts     Mubit provider (Anthropic style by default), or offline stub.
  lib/agent/run.ts       handleReport: one model call, dispatch the tool call.
  lib/agent/mubit-control.ts  Opt-in (MUBIT_CONTROL=on) POST /v2/control/step_outcome; 404 on api.mubit.ai as of 25 Oct.
  lib/services/          items (correctItem, handOver), facts (getBuildingFacts, replaceFact), activity, shifts.
  app/(desk)/radio/       Radio page: listen on the AB13X, transcribe, POST /api/report, speak the reply.
  lib/radio/             Browser audio (worklet tap, gain, voice detection, WAV), transmit setting, OpenAI speech.
scripts/demo.ts          End-to-end demo story with PASS/FAIL checks.
```

## Why plain AI SDK and not Eve

Eve accepts a custom `LanguageModel`, but needs Node 24 and runs calls inside its
own harness (built-in tools, compaction calls, injected context). Mubit groups
calls into one training task by model + system prompt + tools + output format,
so anything that varies those splits the task and resets training. Plain AI SDK
gives exactly one call shape per report.

## The learning loop

1. Report comes in. `getBuildingFacts` + past corrections go into the **user** message.
   System prompt and tools never change, so every call lands in the same Mubit task.
2. The call goes to `https://api.mubit.ai/anthropic/v1/messages` with the Mubit key and
   `metadata.user_id = shiftId` (Mubit's session on the Anthropic route; on the OpenAI
   route it is `metadata.session_id`).
3. Manager corrects an item: before/after saved in `corrections`, and the fact saved in
   `facts`. (Mubit's control API step outcome is off by default: it 404s for our key.)
4. Next report reads the fact, answers right. Mubit keeps those right answers as
   examples; at 25 kept examples it trains an adapter (max 3 starts per UTC day),
   visible under Adapters > History in the console.

Facts are never deleted. Replacing one marks it `replaced` and links the successor,
so "nothing lost" holds for the building's memory as well as for handover.
