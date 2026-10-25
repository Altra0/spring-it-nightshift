import { NextResponse } from "next/server";
import { listFacts } from "@/lib/services/facts";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json({ facts: await listFacts({ includeReplaced: all }) });
}
