import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exercises, profiles, workoutLogs, workoutPlans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { initializeProfile, readAppData, savePlan } from "@/lib/store";
import { normalizeName } from "@/lib/taxonomy";
import { UserFacingError } from "@/lib/errors";
import { buildDiarioLogs, type DiarioSession } from "@/lib/importer";
import { normalizeSettings, type Exercise, type Settings, type WorkoutPlan } from "@/lib/types";
import { exerciseSchema, importSchema, linkSchema, logSchema, planImportSchema, planSchema, settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";



function identity(request: NextRequest) {
  const value = request.cookies.get("forma-profile")?.value;
  return value && /^[a-f0-9-]{36}$/.test(value) ? value : crypto.randomUUID();
}
function response(data: unknown, owner: string) {
  const result = NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  const production = process.env.NODE_ENV === "production";
  result.cookies.set("forma-profile", owner, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    partitioned: production,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return result;
}
export async function GET(request: NextRequest) {
  try {
    const owner = identity(request);
    await initializeProfile(owner);
    return response(await readAppData(owner), owner);
  } catch (error) {
    console.error("Falha ao carregar perfil", error);
    return NextResponse.json({ error: "Não foi possível carregar seus dados. Tente novamente." }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host") && new URL(origin).host !== request.headers.get("x-forwarded-host")) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    const raw = await request.text();
    if (raw.length > 250000) return NextResponse.json({ error: "Conteúdo muito grande." }, { status: 413 });
    const body = JSON.parse(raw) as { action: string; payload: unknown };
    const owner = identity(request);
    await initializeProfile(owner);
    const current = await readAppData(owner);
    const checkIds = (ids: string[]) => { if (ids.some(id => !current.exercises.some(e => e.id === id))) throw new UserFacingError("Um exercício não foi encontrado no catálogo."); };
    switch (body.action) {
      case "savePlan": {
        const plan = planSchema.parse(body.payload) as WorkoutPlan;
        checkIds(plan.exercises.map(p => p.exerciseId));
        await savePlan(owner, plan);
        break;
      }
      case "importPlan": {
        const { plan, exercises: imported } = planImportSchema.parse(body.payload) as { plan: WorkoutPlan; exercises: Exercise[] };
        if (current.plans.some(existing => existing.id === plan.id)) throw new UserFacingError("Este treino já foi importado.");
        const added = imported.filter(exercise => !current.exercises.some(existing => existing.id === exercise.id));
        if (new Set(added.map(exercise => exercise.id)).size !== added.length) throw new UserFacingError("O arquivo contém exercícios repetidos.");
        const available = new Set([...current.exercises, ...added].map(exercise => exercise.id));
        if (plan.exercises.some(exercise => !available.has(exercise.exerciseId))) throw new UserFacingError("O arquivo não contém todos os exercícios do treino.");
        await db.transaction(async tx => {
          if (added.length) await tx.insert(exercises).values(added.map(exercise => ({ id: exercise.id, ownerId: owner, name: exercise.name, facets: exercise })));
          await tx.insert(workoutPlans).values({ ...plan, ownerId: owner });
        });
        break;
      }
      case "saveProgram": {
        const plans = z.array(planSchema).min(1).max(6).parse(body.payload) as WorkoutPlan[];
        for (const plan of plans) {
          checkIds(plan.exercises.map(p => p.exerciseId));
          if (current.plans.some(p => p.id === plan.id)) throw new UserFacingError("Este programa já foi adicionado.");
        }
        await db.insert(workoutPlans).values(plans.map(plan => ({ ...plan, ownerId: owner })));
        break;
      }
      case "deletePlan": {
        const id = z.string().max(100).parse(body.payload);
        await db.delete(workoutPlans).where(and(eq(workoutPlans.ownerId, owner), eq(workoutPlans.id, id)));
        break;
      }
      case "logWorkout": {
        const log = logSchema.parse(body.payload);
        checkIds(log.entries.map(e => e.exerciseId));
        if (log.planId && !current.plans.some(p => p.id === log.planId)) throw new UserFacingError("O treino não está mais disponível neste perfil.");
        await db.insert(workoutLogs).values({ ...log, id: crypto.randomUUID(), ownerId: owner, date: new Date(log.date), demo: false, entries: log.entries.map(e => ({ ...e, sets: e.sets.filter(s => s.completed || s.warmup).map(s => ({ ...s, warmup: s.warmup ?? false })) })).filter(e => e.sets.length) });
        break;
      }
      case "deleteLog": {
        const id = z.string().max(100).parse(body.payload);
        await db.delete(workoutLogs).where(and(eq(workoutLogs.ownerId, owner), eq(workoutLogs.id, id)));
        break;
      }
      case "clearDemo": {
        await db.delete(workoutLogs).where(and(eq(workoutLogs.ownerId, owner), eq(workoutLogs.demo, true)));
        break;
      }
      case "saveSettings": {
        const settings = settingsSchema.parse(body.payload) as Settings;
        await db.update(profiles).set({ settings: { ...normalizeSettings(settings) } }).where(eq(profiles.id, owner));
        break;
      }
      case "checkIn": {
        const score = z.number().int().min(1).max(5).parse(body.payload);
        await db.update(profiles).set({ settings: { ...current.settings, checkIn: { score, date: new Date().toISOString() } } }).where(eq(profiles.id, owner));
        break;
      }
      case "saveExercise": {
        const exercise = exerciseSchema.parse(body.payload) as Exercise;
        await db.insert(exercises).values({ id: exercise.id, ownerId: owner, name: exercise.name, facets: exercise }).onConflictDoUpdate({ target: [exercises.ownerId, exercises.id], set: { name: exercise.name, facets: exercise } });
        break;
      }
      case "importDiario": {
        const { sessions } = importSchema.parse(body.payload) as { sessions: DiarioSession[] };
        const built = buildDiarioLogs(sessions, current.exercises, current.settings.nameAliases, owner);
        for (const ex of built.custom) await db.insert(exercises).values({ id: ex.id, ownerId: owner, name: ex.name, facets: ex }).onConflictDoNothing();
        if (built.logs.length) await db.insert(workoutLogs).values(built.logs.map(l => ({ ...l, id: crypto.randomUUID(), ownerId: owner, date: new Date(l.date), demo: false })));
        break;
      }
      case "linkExercise": {
        const { exerciseId, targetId } = linkSchema.parse(body.payload);
        const source = current.exercises.find(e => e.id === exerciseId);
        const target = current.exercises.find(e => e.id === targetId);
        if (!target) throw new UserFacingError("O exercício de destino não existe no catálogo.");
        if (!source || !current.userExerciseIds.includes(exerciseId)) throw new UserFacingError("Este exercício não pode ser vinculado.");
        const logs = await db.select().from(workoutLogs).where(eq(workoutLogs.ownerId, owner));
        for (const l of logs) {
          if (!l.entries.some(e => e.exerciseId === exerciseId)) continue;
          await db.update(workoutLogs).set({ entries: l.entries.map(e => e.exerciseId === exerciseId ? { ...e, exerciseId: targetId } : e) }).where(eq(workoutLogs.id, l.id));
        }
        const aliases = { ...current.settings.nameAliases, [normalizeName(source.name)]: targetId };
        await db.update(profiles).set({ settings: { ...current.settings, nameAliases: aliases } }).where(eq(profiles.id, owner));
        await db.delete(exercises).where(and(eq(exercises.ownerId, owner), eq(exercises.id, exerciseId)));
        break;
      }
      default: return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
    }
    return response(await readAppData(owner), owner);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Confira os campos preenchidos." }, { status: 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Falha inesperada ao salvar perfil", error instanceof Error ? error.name : "erro desconhecido");
    return NextResponse.json({ error: "Não foi possível confirmar o salvamento. Confira seus dados antes de tentar novamente." }, { status: 500 });
  }
}
