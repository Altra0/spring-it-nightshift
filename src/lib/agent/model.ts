import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { stubModel } from "./stub";

// Every model call goes through Mubit so it can train this building's adapter.
// MUBIT_STYLE=anthropic (default) uses Ese's Claude key saved in the Mubit console.
export type ModelHandle = {
  model: LanguageModel;
  label: string;
  /** providerOptions that tag the call with the shift as Mubit's session. */
  sessionOptions: (shiftId: string) => Record<string, Record<string, unknown>>;
};

export function getModel(): ModelHandle {
  const key = process.env.MUBIT_API_KEY;
  const mode = process.env.LLM_MODE ?? (key ? "mubit" : "stub");
  if (mode === "stub" || !key) {
    return { model: stubModel, label: "stub (offline, no Mubit)", sessionOptions: () => ({}) };
  }
  const style = process.env.MUBIT_STYLE ?? "anthropic";
  if (style === "openai") {
    const modelId = process.env.MUBIT_MODEL ?? "gpt-5-mini";
    const openai = createOpenAI({ apiKey: key, baseURL: process.env.MUBIT_BASE_URL ?? "https://api.mubit.ai/openai/v1" });
    return {
      model: openai.chat(modelId),
      label: `mubit/openai/${modelId}`,
      sessionOptions: (shiftId) => ({ openai: { metadata: { session_id: shiftId } } }),
    };
  }
  const modelId = process.env.MUBIT_MODEL ?? "claude-haiku-4-5";
  const anthropic = createAnthropic({ apiKey: key, baseURL: process.env.MUBIT_BASE_URL ?? "https://api.mubit.ai/anthropic/v1" });
  return {
    model: anthropic(modelId),
    label: `mubit/anthropic/${modelId}`,
    // Anthropic has no session field; Mubit reads metadata.user_id as the session.
    sessionOptions: (shiftId) => ({ anthropic: { metadata: { userId: shiftId } } }),
  };
}
