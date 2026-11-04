import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap.sql";
import { SEED } from "./seed";

type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __springDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    db = drizzleNeon(neon(url), { schema }) as unknown as Db;
  } else {
    // No DATABASE_URL: embedded Postgres on disk so the app always runs.
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    db = drizzlePglite(new PGlite(dir), { schema });
  }
  for (const stmt of BOOTSTRAP_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
  await seedIfEmpty(db);
  return db;
}

async function seedIfEmpty(db: Db) {
  const existing = await db.select().from(schema.buildings).limit(1);
  if (existing.length) return;
  await db.insert(schema.buildings).values(SEED.building);
  await db
    .insert(schema.locations)
    .values(SEED.locations.map((l) => ({ ...l, buildingId: SEED.building.id })));
  await db
    .insert(schema.facts)
    .values(SEED.facts.map((f) => ({ ...f, buildingId: SEED.building.id, source: "seed" as const })));
}

export function getDb(): Promise<Db> {
  if (!g.__springDb) {
    g.__springDb = connect().catch((err) => {
      g.__springDb = undefined;
      throw err;
    });
  }
  return g.__springDb;
}

export { schema };
