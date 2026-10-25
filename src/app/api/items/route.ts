import { NextResponse } from "next/server";
import { listItems } from "@/lib/services/items";
import { bad } from "@/lib/http";

const STATUSES = ["open", "handed_over", "closed"] as const;

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) return bad(`status must be one of ${STATUSES.join(", ")}`);
  return NextResponse.json({ items: await listItems((status as (typeof STATUSES)[number]) ?? undefined) });
}
