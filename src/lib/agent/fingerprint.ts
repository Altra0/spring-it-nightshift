import { createHash } from "node:crypto";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";
import { AGENT_TOOLS } from "./tools";

// Short hash of everything Mubit groups a task by that lives in our code
// (system prompt, tool names, descriptions, input schemas). Logged on every
// model.called event; if it ever changes, the Mubit task has split.
const toolShapes = Object.entries(AGENT_TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  schema: z.toJSONSchema(t.inputSchema as z.ZodType),
}));

export const TASK_FINGERPRINT = createHash("sha256")
  .update(JSON.stringify({ system: SYSTEM_PROMPT, tools: toolShapes }))
  .digest("hex")
  .slice(0, 12);
