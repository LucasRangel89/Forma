import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { exercises, profiles, workoutLogs, workoutPlans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { initializeProfile, readAppData, savePlan } from "@/lib/store";
import { normalizeName } from "@/lib/taxonomy";
import { buildDiarioLogs, type DiarioSession } from "@/lib/importer";
import { COARSE_LABELS, EQUIPMENT, MUSCLE_LABELS, ROLES, normalizeSettings, type Exercise, type Settings, type WorkoutPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
const muscle = z.enum(Object.keys(MUSCLE_LABELS) as [string, ...string[]]);
const level = z.enum(["Iniciante", "Intermediário", "Avançado"]);
const role = z.enum(ROLES as [string, ...string[]]);
const equipment = z.enum(EQUIPMENT as [string, ...string[]]);
const prescriptionSchema = z.object({ exerciseId: z.string().min(1).max(140), sets: z.number().int().min(1).max(12), repsMin: z.number().int().min(1).max(120), repsMax: z.number().int().min(1).max(120), rir: z.number().min(0).max(10), rest: z.number().int().min(0).max(600), role, technique: z.enum(["Tradicional", "Drop-set", "Rest-pause", "Cluster"]) }).refine(v => v.repsMin <= v.repsMax, "A faixa de repetições está invertida.");
const planSchema = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60), subtitle: z.string().max(140), type: z.enum(["Upper", "Lower", "Full body", "Personalizado"]), day: z.number().int().min(0).max(6), exercises: z.array(prescriptionSchema).min(1).max(25) });
const setSchema = z.object({ reps: z.number().int().min(1).max(120), weight: z.number().min(0).max(1000), rir: z.union([z.number().min(0).max(10), z.null()]), completed: z.boolean(), warmup: z.boolean().optional(), rpe: z.union([z.number().min(0).max(13), z.null()]).optional(), failure: z.boolean().optional() });
const logSchema = z.object({ planId: z.string().max(100).nullable(), name: z.string().trim().min(1).max(60), date: z.string().datetime(), duration: z.number().int().min(0).max(600), entries: z.array(z.object({ exerciseId: z.string().min(1).max(140), sets: z.array(setSchema).min(1).max(20) })).min(1).max(30), notes: z.string().max(2000) }).refine(v => v.entries.some(e => e.sets.some(s => s.completed)), "Conclua pelo menos uma série para registrar o treino.").refine(v => new Date(v.date).getTime() <= Date.now() + 60000, "O registro não pode ter uma data futura.");
const fatigueScaleSchema = z.object({ quasePronto: z.number().min(0).max(100), recuperando: z.number().min(0).max(100), fadigado: z.number().min(0).max(100), exausto: z.number().min(0).max(100) }).refine(v => v.quasePronto < v.recuperando && v.recuperando < v.fadigado && v.fadigado < v.exausto, "A escala de fadiga deve ser crescente.");
const rirFactorsSchema = z.object({ falha: z.number().min(0).max(3), rir1: z.number().min(0).max(3), rir3: z.number().min(0).max(3), acima: z.number().min(0).max(3) });
const settingsSchema = z.object({ name: z.string().trim().min(1).max(60), goal: z.enum(["Hipertrofia", "Força", "Condicionamento"]), level, days: z.number().int().min(2).max(6), sessionMinutes: z.number().int().min(20).max(120), equipment: z.array(equipment).min(1), restrictions: z.array(z.enum(["Ombro", "Joelho", "Lombar", "Punho"])), priorities: z.array(muscle).max(10), indirectWeight: z.number().min(0).max(1), sessionCap: z.number().int().min(4).max(20), smallTau: z.number().min(.5).max(5), largeTau: z.number().min(.5).max(5), fatigueScale: fatigueScaleSchema, rirFactors: rirFactorsSchema, targets: z.record(z.string(), z.number().min(0).max(40)), favorites: z.array(z.string()).max(500), checkIn: z.object({ score: z.number().int().min(1).max(5), date: z.string().datetime() }).nullable(), nameAliases: z.record(z.string(), z.string()).refine(v => Object.keys(v).length <= 500, "Muitos aliases."), gamification: z.object({ enabled: z.boolean() }), appearance: z.enum(["forma", "noite"]) });
const weighted = z.object({ muscle, weight: z.number().min(.05).max(1) });
const exerciseSchema = z.object({ id: z.string().min(1).max(140), name: z.string().trim().min(2).max(100), primary: z.array(weighted).min(1).max(8), secondary: z.array(weighted).max(8), pattern: z.string().min(2).max(60), equipment: z.array(equipment).min(1).max(9), joints: z.number().int().min(1).max(4), laterality: z.enum(["Bilateral", "Unilateral"]), roles: z.array(role).min(1), emphasis: z.array(z.string().max(40)).max(6), systemic: z.enum(["Baixa", "Média", "Alta"]), technical: z.enum(["Baixa", "Média", "Alta"]), level, resistance: z.enum(["Alongado", "Intermediário", "Encurtado"]), restrictions: z.array(z.enum(["Ombro", "Joelho", "Lombar", "Punho"])), sfr: z.number().int().min(1).max(5), instructions: z.string().max(2500), goal: z.number().min(0).max(1000).optional() }).refine(v => {
  const muscles = [...v.primary, ...v.secondary].map(m => m.muscle);
  return new Set(muscles).size === muscles.length;
}, "Cada músculo deve aparecer apenas uma vez, como primário ou secundário.");
const diarioSessionSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD"), name: z.string().trim().min(2).max(80), group: z.enum(COARSE_LABELS), weight: z.number().min(0).max(1000), reps: z.array(z.number().int().min(1).max(60)).min(1).max(20), technique: z.string().max(80).optional(), goal: z.number().min(0).max(1000).optional() });
const importSchema = z.object({ sessions: z.array(diarioSessionSchema).min(1).max(500) });
const linkSchema = z.object({ exerciseId: z.string().min(1).max(140), targetId: z.string().min(1).max(140) });

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
    const checkIds = (ids: string[]) => { if (ids.some(id => !current.exercises.some(e => e.id === id))) throw new Error("Um exercício não foi encontrado no catálogo."); };
    switch (body.action) {
      case "savePlan": {
        const plan = planSchema.parse(body.payload) as WorkoutPlan;
        checkIds(plan.exercises.map(p => p.exerciseId));
        await savePlan(owner, plan);
        break;
      }
      case "saveProgram": {
        const plans = z.array(planSchema).min(1).max(6).parse(body.payload) as WorkoutPlan[];
        for (const plan of plans) {
          checkIds(plan.exercises.map(p => p.exerciseId));
          if (current.plans.some(p => p.id === plan.id)) throw new Error("Este programa já foi adicionado.");
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
        if (log.planId && !current.plans.some(p => p.id === log.planId)) throw new Error("O treino não está mais disponível neste perfil.");
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
        if (!target) throw new Error("O exercício de destino não existe no catálogo.");
        if (!source || !current.userExerciseIds.includes(exerciseId)) throw new Error("Este exercício não pode ser vinculado.");
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
    console.error("Falha ao salvar", error);
    return NextResponse.json({ error: error instanceof Error && !error.message.includes("query") ? error.message : "Não foi possível salvar. Tente novamente." }, { status: 400 });
  }
}
