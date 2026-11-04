import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const buildings = pgTable("buildings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  name: text("name").notNull(),
  // Other names staff use on the radio, comma separated.
  aliases: text("aliases").notNull().default(""),
});

export const facts = pgTable("facts", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["active", "replaced"] }).notNull().default("active"),
  replacedBy: text("replaced_by"),
  source: text("source", { enum: ["correction", "seed"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: text("id").primaryKey(),
  staff: text("staff").notNull(),
  start: timestamp("start", { withTimezone: true }).notNull().defaultNow(),
  end: timestamp("end", { withTimezone: true }),
  handedTo: text("handed_to"),
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").notNull(),
  rawText: text("raw_text").notNull(),
  source: text("source", { enum: ["radio", "text"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").notNull(),
  reportId: text("report_id"),
  kind: text("kind", { enum: ["report", "contractor", "note"] }).notNull().default("report"),
  // Short Spring It title for list rows, e.g. "Fire door propped open".
  title: text("title"),
  summary: text("summary").notNull(),
  category: text("category").notNull(),
  location: text("location"),
  urgency: text("urgency", { enum: ["low", "normal", "urgent"] }).notNull(),
  managerDecides: boolean("manager_decides").notNull().default(false),
  status: text("status", { enum: ["open", "handed_over", "closed"] }).notNull().default("open"),
  assignee: text("assignee"),
  dueAt: text("due_at"),
  corrected: boolean("corrected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const corrections = pgTable("corrections", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  factId: text("fact_id"),
  mubitAccepted: boolean("mubit_accepted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activity = pgTable("activity", {
  seq: integer("seq").primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  shiftId: text("shift_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
});

// One row per model call for this building. Survives the keep-facts demo reset so the
// "calls sent to Mubit" count stays honest.
export const modelCalls = pgTable("model_calls", {
  seq: integer("seq").primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  shiftId: text("shift_id"),
  task: text("task").notNull(),
  model: text("model").notNull(),
  replay: boolean("replay").notNull().default(false),
});

export type Item = typeof items.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type Correction = typeof corrections.$inferSelect;
export type Activity = typeof activity.$inferSelect;
