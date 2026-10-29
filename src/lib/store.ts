import { db } from "@/db";
import { exercises, profiles, workoutLogs, workoutPlans } from "@/db/schema";
import { and, eq, or, desc } from "drizzle-orm";
import { CATALOG } from "./catalog";
import { UserFacingError } from "./errors";
import { buildDemo } from "./demo";
import { normalizeSettings, type AppData, type WorkoutPlan } from "./types";

export async function initializeProfile(owner: string) {
  const existingCatalog = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.ownerId, "catalog")).limit(1);
  if (!existingCatalog.length) await db.insert(exercises).values(CATALOG.map(e => ({ id: e.id, name: e.name, ownerId: "catalog", facets: e }))).onConflictDoNothing();
  const profile = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, owner)).limit(1);
  if (profile.length) return;
  const demo = buildDemo(owner);
  await db.transaction(async tx => {
    const added = await tx.insert(profiles).values({ id: owner, settings: demo.settings }).onConflictDoNothing().returning();
    if (!added.length) return;
    await tx.insert(workoutPlans).values(demo.plans.map(plan => ({ ...plan, ownerId: owner })));
    await tx.insert(workoutLogs).values(demo.logs.map(log => ({ ...log, ownerId: owner, date: new Date(log.date) })));
  });
}
export async function readAppData(owner: string): Promise<AppData> {
  const [profile, catalog, plans, logs] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.id, owner)).limit(1),
    db.select().from(exercises).where(or(eq(exercises.ownerId, "catalog"), eq(exercises.ownerId, owner))),
    db.select().from(workoutPlans).where(eq(workoutPlans.ownerId, owner)),
    db.select().from(workoutLogs).where(eq(workoutLogs.ownerId, owner)).orderBy(desc(workoutLogs.date)),
  ]);
  const merged = new Map(catalog.filter(e => e.ownerId === "catalog").map(e => [e.id, e.facets]));
  const userRows = catalog.filter(e => e.ownerId === owner);
  userRows.forEach(e => merged.set(e.id, e.facets));
  return {
    settings: normalizeSettings(profile[0]?.settings),
    exercises: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    plans: plans.map(({ ownerId: _owner, ...plan }) => ({ ...plan, type: plan.type as WorkoutPlan["type"] })).sort((a, b) => a.day - b.day),
    logs: logs.map(({ ownerId: _owner, ...log }) => ({ ...log, date: log.date.toISOString() })),
    userExerciseIds: userRows.map(e => e.id),
  };
}
export async function savePlan(owner: string, plan: WorkoutPlan) {
  const existing = await db.select({ ownerId: workoutPlans.ownerId }).from(workoutPlans).where(eq(workoutPlans.id, plan.id)).limit(1);
  if (existing.length && existing[0].ownerId !== owner) throw new UserFacingError("Treino não encontrado neste perfil.");
  await db.insert(workoutPlans).values({ ...plan, ownerId: owner }).onConflictDoUpdate({ target: workoutPlans.id, set: { name: plan.name, subtitle: plan.subtitle, type: plan.type, day: plan.day, exercises: plan.exercises }, setWhere: and(eq(workoutPlans.ownerId, owner), eq(workoutPlans.id, plan.id)) });
}
