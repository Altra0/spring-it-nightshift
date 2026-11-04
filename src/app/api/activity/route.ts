import { NextResponse } from "next/server";
import { listActivity } from "@/lib/services/activity";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 200);
  return NextResponse.json({ activity: await listActivity(Number.isFinite(limit) ? limit : 200) });
}
