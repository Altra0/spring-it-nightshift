# spring-it-nightshift
Spring It at Night Shift London (Mubit hackathon). Voice-to-handover for residential property teams that learns from manager corrections.

## Run

```bash
npm install
cp .env.example .env.local   # paste MUBIT_API_KEY and DATABASE_URL
npm run dev
npm run demo                 # in another terminal: the four-step demo story with checks
```

Without `MUBIT_API_KEY` the app uses an offline stub model so the wiring can be
tested; the demo output says which model ran. Without `DATABASE_URL` it uses an
embedded Postgres in `.data/`.

API contract: [docs/api.md](docs/api.md). Layout and the Mubit loop: [docs/architecture.md](docs/architecture.md).
