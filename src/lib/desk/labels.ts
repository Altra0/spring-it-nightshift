import {
  BrushCleaning, DoorClosed, Droplets, Fence, Flame, HeartHandshake, KeyRound,
  ShieldAlert, StickyNote, Volume2, Wrench, type LucideIcon,
} from "lucide-react";
import type { Category, Item, Urgency } from "./types";

export const CATEGORIES: Category[] = [
  "fire_safety", "security", "access", "maintenance", "cleaning",
  "noise", "resident_welfare", "contractor", "other",
];
export const URGENCIES: Urgency[] = ["low", "normal", "urgent"];

export const CATEGORY_LABEL: Record<Category, string> = {
  fire_safety: "Fire safety",
  security: "Security",
  access: "Access",
  maintenance: "Maintenance",
  cleaning: "Cleaning",
  noise: "Noise",
  resident_welfare: "Resident welfare",
  contractor: "Contractor",
  other: "Other",
};

export const URGENCY_LABEL: Record<Urgency, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };

const has = (item: Pick<Item, "summary" | "location">, re: RegExp) => re.test(`${item.summary} ${item.location ?? ""}`);

/** Round row icon: by category, refined by what the report is about
 *  (fire door, leak, gate, resident, plumber). */
export function itemIcon(item: Pick<Item, "category" | "summary" | "location">): LucideIcon {
  if (item.category === "fire_safety") return has(item, /door/i) ? DoorClosed : Flame;
  if (item.category === "contractor") return Wrench;
  if (has(item, /leak|water|drip|flood/i)) return Droplets;
  if (has(item, /gate/i)) return Fence;
  switch (item.category) {
    case "security": return ShieldAlert;
    case "access": return KeyRound;
    case "maintenance": return Wrench;
    case "cleaning": return BrushCleaning;
    case "noise": return Volume2;
    case "resident_welfare": return HeartHandshake;
    default: return StickyNote;
  }
}

/** Icon disc tint by category, so the list scans like a statement. */
export function iconTone(category: Category) {
  switch (category) {
    case "fire_safety": return "bg-si-red/10 text-si-red";
    case "security":
    case "access": return "bg-si-neutral/10 text-si-neutral";
    case "contractor":
    case "maintenance": return "bg-si-marker/50 text-si-text";
    case "resident_welfare": return "bg-si-green/10 text-si-green";
    default: return "bg-si-tint text-si-neutral";
  }
}

const TZ = "Europe/London";

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function dayTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ })}, ${time(iso)}`;
}

/** "night-2026-10-25" -> "Sat 25 Oct". Unknown shapes are shown as given. */
export function shiftLabel(shiftId: string) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(shiftId);
  if (!m) return shiftId;
  const d = new Date(`${m[1]}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
