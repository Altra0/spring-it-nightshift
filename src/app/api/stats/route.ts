import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { TASK_FINGERPRINT } from "@/lib/agent/fingerprint";

const MUBIT_TASK = "Spring It 3";
const MUBIT_CONSOLE_URL =
  "https://app.mubit.ai/console/projects/ws-3e092efdb35494e4/workloads/ln_507d3bbdb331f9a0cb85d63e";

export async function GET() {
  const db = await getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      replays: sql<number>`count(*) filter (where ${schema.modelCalls.replay})::int`,
      thisTask: sql<number>`count(*) filter (where ${schema.modelCalls.task} = ${TASK_FINGERPRINT})::int`,
    })
    .from(schema.modelCalls);
  return NextResponse.json({
    modelCalls: row.total - row.replays,
    replayCalls: row.replays,
    callsThisTask: row.thisTask,
    model: process.env.MUBIT_MODEL ?? "claude-haiku-4-5",
    task: MUBIT_TASK,
    fingerprint: TASK_FINGERPRINT,
    status: "Queued to train this building's model",
    consoleUrl: MUBIT_CONSOLE_URL,
  });
}
