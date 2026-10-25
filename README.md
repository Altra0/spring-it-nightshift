# Spring It

**Spring It turns a night concierge's radio calls into a clean handover, and learns each building's rules from the manager's corrections.**

Built at Night Shift London (Mubit hackathon), 24–25 Oct 2026.

## A real use case

This comes straight from the Spring It product, and from six years of front-desk experience in London residential buildings. A night shift lives on the radio, and every building has its own rules that nobody writes down: which door is a fire door, which gate is locked this week, what the day manager wants to decide personally. Today that knowledge sits in people's heads and in binders, and it walks out at every shift change.

## What it does

Night teams in residential buildings report problems over the radio: a door propped open, a leak, a resident locked out. Those reports end up as scribbled notes, and nothing teaches the system that, in *this* building, the bin store door is a fire door on the escape route. Spring It logs each report as a structured open item. When a manager corrects an item, the correction becomes building memory, so the next report is handled correctly. Every model call goes through Mubit, which uses those right answers to train this building's own model.

## The loop

```
radio call ──► transcript ──► POST /api/report ──► one model call via Mubit
                                                    (frozen prompt + tools,
                                                     building facts in the message)
                                                         │
                     spoken reply back to staff ◄────────┤
                                                         ▼
                                              open item on the manager's desk
                                                         │
                               manager corrects it ──────┤  (before/after saved)
                                                         ▼
                                   building fact ──► included in every later call
                                                         │
                                                         ▼
                             right answers kept by Mubit ──► adapter trained for
                                                             this building
```

1. **Radio → report.** `/radio` listens on the USB sound card, transcribes the call and sends the text to `POST /api/report`.
2. **Report → item.** One model call (Claude Haiku 4.5 through Mubit) turns it into an item with a short title, category, location, urgency and whether the manager decides, and returns one sentence to say back over the radio.
3. **Correction → building memory.** On the manager's desk, a correction saves the before and after and adds a fact, e.g. "Bin store door = fire door on the escape route".
4. **Memory → the next answer.** Every later call includes the building's active facts and past corrections. A report about the "refuse room door on level minus one" now comes back as fire safety, urgent, manager decides.
5. **Mubit → this building's model.** The system prompt, tools and output schema never change (`src/lib/agent/fingerprint.ts`), so every call lands in one Mubit task ("Spring It 3"). Mubit keeps the correct answers as training examples. Training starts once a task has 25 kept examples, and each new adapter version appears in the Mubit console.
6. **The building's own procedures.** Redacted standard operating procedures are loaded as building facts, and 71 training reports based on them have gone through the same Mubit task (72 were sent; 1 failed with a 502).
7. **Rules change, nothing is lost.** Facts are never deleted. A replaced fact is kept and linked to the fact that replaced it. At the end of the shift, "End of shift, hand over" moves every open item to the day manager, who accepts it.

## One model per building

Mubit lets us deliver a model per building. Beyond the hackathon, the hierarchy is **Org > Estate > Building**. Each customer unit gets its own model, trained on its own procedures and its own managers' corrections. See [docs/vision.md](docs/vision.md).

## What the demo video shows

The same story `npm run demo` checks end to end against real Mubit:

1. **It doesn't know.** "Bin store door's propped open again" comes back as routine maintenance.
2. **One correction.** The manager changes it to fire safety, urgent, manager decides, and adds the fact that it's a fire door on the escape route.
3. **It remembers.** "Refuse room door on level minus one, wedged open with a bin" comes back as fire safety, urgent, manager decides. Same place, different words.
4. **Rules change.** The side gate fact is replaced with "locked for scaffolding until 12 Nov". A resident stuck at the side gate gets sent to the main entrance.
5. **Nothing lost at handover.** "End of shift, hand over" moves every open item to Datte Bayo, the day manager, who accepts.
6. **It learned.** The corrections log shows before and after, and the Mubit console shows the task's kept examples.

## Status (honest)

- Working: the agent, building memory, corrections, handover, the manager's desk, and real Mubit calls (`npm run demo` passes on the iMac with every call on `mubit/anthropic/claude-haiku-4-5`).
- Radio: **receiving over the radio works.** The reply plays on the iMac speaker for now. The radio cable has no working transmit path, so transmitting back over the radio waits for the AIOC cable (see [docs/radio.md](docs/radio.md)).
- Mubit's control-plane `step_outcome` call returned 404 for our key, so it is off by default (`MUBIT_CONTROL=on` enables it). The learning loop doesn't depend on it.

## Run it

Needs Node 20+ (tested on 24), a Mubit key with a Claude provider key saved in the Mubit console, and optionally a Neon Postgres URL.

```bash
npm install
vercel env pull .env.local     # or: cp .env.example .env.local and fill in MUBIT_API_KEY, DATABASE_URL
npm run dev                    # desk at http://localhost:3000, radio at /radio
npm run demo                   # second terminal: the story above, with PASS/FAIL checks
npm run demo -- --keep-facts   # same, but keeps standalone facts already loaded
```

Without `MUBIT_API_KEY` the app uses an offline stand-in model, only for testing the wiring, and the demo prints which model ran. Without `DATABASE_URL` it uses an embedded Postgres in `.data/`.

## Docs

- [docs/api.md](docs/api.md): the API contract
- [docs/architecture.md](docs/architecture.md): layout and the Mubit loop
- [docs/radio.md](docs/radio.md): the radio page
- [docs/vision.md](docs/vision.md): one model per building
