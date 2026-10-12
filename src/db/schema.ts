import { pgTable, text, jsonb, integer, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import type { Exercise, Prescription, LoggedExercise, Settings } from "@/lib/types";

export const exercises = pgTable("forma_exercises", {
  ownerId: text("owner_id").notNull().default("catalog"),
  id: text("id").notNull(),
  name: text("name").notNull(),
  facets: jsonb("facets").$type<Exercise>().notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.id] })]);

export const profiles = pgTable("forma_profiles", {
  id: text("id").primaryKey(),
  settings: jsonb("settings").$type<Settings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workoutPlans = pgTable("forma_workout_plans", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  type: text("type").notNull(),
  day: integer("day").notNull(),
  exercises: jsonb("exercises").$type<Prescription[]>().notNull(),
});

export const workoutLogs = pgTable("forma_workout_logs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  planId: text("plan_id"),
  name: text("name").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  duration: integer("duration").notNull(),
  entries: jsonb("entries").$type<LoggedExercise[]>().notNull(),
  notes: text("notes").notNull().default(""),
  demo: boolean("demo").notNull().default(false),
});
