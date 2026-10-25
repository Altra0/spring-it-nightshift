import type { Metadata } from "next";
import { RadioView } from "@/components/radio/radio-view";

export const metadata: Metadata = { title: "Radio · Spring It" };

export default function RadioPage() {
  return <RadioView />;
}
