import { z } from "zod";
import { COARSE_LABELS, EQUIPMENT, MUSCLE_LABELS, ROLES } from "./types";

const muscle = z.enum(Object.keys(MUSCLE_LABELS) as [string, ...string[]]);
const level = z.enum(["Iniciante", "Intermediário", "Avançado"]);
const role = z.enum(ROLES as [string, ...string[]]);
const equipment = z.enum(EQUIPMENT as [string, ...string[]]);
export const prescriptionSchema = z.object({ exerciseId: z.string().min(1).max(140), sets: z.number().int().min(1).max(12), repsMin: z.number().int().min(1).max(120), repsMax: z.number().int().min(1).max(120), rir: z.number().min(0).max(10), rest: z.number().int().min(0).max(600), role, technique: z.enum(["Tradicional", "Drop-set", "Rest-pause", "Cluster"]) }).refine(v => v.repsMin <= v.repsMax, "A faixa de repetições está invertida.");
export const planSchema = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60), subtitle: z.string().max(140), type: z.enum(["Upper", "Lower", "Full body", "Personalizado"]), day: z.number().int().min(0).max(6), exercises: z.array(prescriptionSchema).min(1).max(25) });
export const setSchema = z.object({ reps: z.number().int().min(1).max(120), weight: z.number().min(0).max(1000), rir: z.union([z.number().min(0).max(10), z.null()]), completed: z.boolean(), warmup: z.boolean().optional(), rpe: z.union([z.number().min(0).max(13), z.null()]).optional(), failure: z.boolean().optional() });
const logFieldsSchema = z.object({ planId: z.string().max(100).nullable(), name: z.string().trim().min(1).max(60), date: z.string().datetime(), duration: z.number().int().min(0).max(600), entries: z.array(z.object({ exerciseId: z.string().min(1).max(140), sets: z.array(setSchema).min(1).max(20) })).min(1).max(30), notes: z.string().max(2000) });
export const logSchema = logFieldsSchema.refine(v => v.entries.some(e => e.sets.some(s => s.completed)), "Conclua pelo menos uma série para registrar o treino.").refine(v => new Date(v.date).getTime() <= Date.now() + 60000, "O registro não pode ter uma data futura.");
const fatigueScaleSchema = z.object({ quasePronto: z.number().min(0).max(100), recuperando: z.number().min(0).max(100), fadigado: z.number().min(0).max(100), exausto: z.number().min(0).max(100) }).refine(v => v.quasePronto < v.recuperando && v.recuperando < v.fadigado && v.fadigado < v.exausto, "A escala de fadiga deve ser crescente.");
const rirFactorsSchema = z.object({ falha: z.number().min(0).max(3), rir1: z.number().min(0).max(3), rir3: z.number().min(0).max(3), acima: z.number().min(0).max(3) });
export const settingsSchema = z.object({ name: z.string().trim().min(1).max(60), goal: z.enum(["Hipertrofia", "Força", "Condicionamento"]), level, days: z.number().int().min(2).max(6), sessionMinutes: z.number().int().min(20).max(120), equipment: z.array(equipment).min(1), restrictions: z.array(z.enum(["Ombro", "Joelho", "Lombar", "Punho"])), priorities: z.array(muscle).max(10), indirectWeight: z.number().min(0).max(1), sessionCap: z.number().int().min(4).max(20), smallTau: z.number().min(.5).max(5), largeTau: z.number().min(.5).max(5), fatigueScale: fatigueScaleSchema, rirFactors: rirFactorsSchema, targets: z.record(z.string(), z.number().min(0).max(40)), favorites: z.array(z.string()).max(500), checkIn: z.object({ score: z.number().int().min(1).max(5), date: z.string().datetime() }).nullable(), nameAliases: z.record(z.string(), z.string()).refine(v => Object.keys(v).length <= 500, "Muitos aliases."), gamification: z.object({ enabled: z.boolean() }), appearance: z.enum(["forma", "noite"]) });
const weighted = z.object({ muscle, weight: z.number().min(.05).max(1) });
export const exerciseSchema = z.object({ id: z.string().min(1).max(140), name: z.string().trim().min(2).max(100), primary: z.array(weighted).min(1).max(8), secondary: z.array(weighted).max(8), pattern: z.string().min(2).max(60), equipment: z.array(equipment).min(1).max(9), joints: z.number().int().min(1).max(4), laterality: z.enum(["Bilateral", "Unilateral"]), roles: z.array(role).min(1), emphasis: z.array(z.string().max(40)).max(6), systemic: z.enum(["Baixa", "Média", "Alta"]), technical: z.enum(["Baixa", "Média", "Alta"]), level, resistance: z.enum(["Alongado", "Intermediário", "Encurtado"]), restrictions: z.array(z.enum(["Ombro", "Joelho", "Lombar", "Punho"])), sfr: z.number().int().min(1).max(5), instructions: z.string().max(2500), goal: z.number().min(0).max(1000).optional() }).refine(v => {
  const muscles = [...v.primary, ...v.secondary].map(m => m.muscle);
  return new Set(muscles).size === muscles.length;
}, "Cada músculo deve aparecer apenas uma vez, como primário ou secundário.");
export const diarioSessionSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD").refine(value => { const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Informe uma data válida."), name: z.string().trim().min(2).max(80), group: z.enum(COARSE_LABELS), weight: z.number().min(0).max(1000), reps: z.array(z.number().int().min(1).max(60)).min(1).max(20), technique: z.string().max(80).optional(), goal: z.number().min(0).max(1000).optional() });
export const importSchema = z.object({ sessions: z.array(diarioSessionSchema).min(1).max(500) });
export const linkSchema = z.object({ exerciseId: z.string().min(1).max(140), targetId: z.string().min(1).max(140) });

// Backups contain historical records, including records imported from the Diário
// (whose names can be longer than the manual-workout form permits).
export const storedLogSchema = logFieldsSchema.extend({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  demo: z.boolean(),
}).refine(v => v.entries.some(e => e.sets.some(s => s.completed)), "O registro precisa ter uma série concluída.");

export const appDataSchema = z.object({
  exercises: z.array(exerciseSchema).min(1).max(5000),
  plans: z.array(planSchema).max(5000),
  logs: z.array(storedLogSchema).max(50000),
  settings: settingsSchema,
  userExerciseIds: z.array(z.string().min(1).max(140)).max(5000),
}).superRefine((data, ctx) => {
  const exerciseIds = new Set(data.exercises.map(e => e.id));
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(data.exercises.map(e => e.id)) || !unique(data.plans.map(p => p.id)) || !unique(data.logs.map(l => l.id))) {
    ctx.addIssue({ code: "custom", message: "O backup contém identificadores repetidos." });
  }
  if (data.userExerciseIds.some(id => !exerciseIds.has(id)) ||
      data.plans.some(p => p.exercises.some(e => !exerciseIds.has(e.exerciseId))) ||
      data.logs.some(l => l.entries.some(e => !exerciseIds.has(e.exerciseId)))) {
    ctx.addIssue({ code: "custom", message: "O backup contém referências a exercícios ausentes." });
  }
});
