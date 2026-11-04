import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export async function GET() {
  const db = await getDb();
  return NextResponse.json({ corrections: await db.select().from(schema.corrections).orderBy(desc(schema.corrections.createdAt)) });
}
