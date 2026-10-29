import { e1rm } from "./engine";
import type { LoggedSet, Prescription, WorkoutLog } from "./types";

export interface ExerciseSession {
  log: WorkoutLog;
  sets: LoggedSet[];
}

// One point per session, even if an exercise appears in more than one entry.
// Future sessions, incomplete sets and warm-ups are never used as performance.
export function exerciseSessions(
  logs: WorkoutLog[],
  exerciseId: string,
  options: { includeExamples?: boolean; since?: number; until?: number } = {},
): ExerciseSession[] {
  const until = options.until ?? Date.now();
  return logs.flatMap(log => {
    const time = new Date(log.date).getTime();
    if (!Number.isFinite(time) || time > until || (options.since != null && time < options.since) || (log.demo && !options.includeExamples)) return [];
    const sets = log.entries.filter(entry => entry.exerciseId === exerciseId).flatMap(entry => entry.sets.filter(set => set.completed && !set.warmup));
    return sets.length ? [{ log, sets }] : [];
  }).sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime() || a.log.id.localeCompare(b.log.id));
}

export type ProgressionKind = "not-applicable" | "no-history" | "ambiguous" | "partial" | "unknown-effort" | "bodyweight" | "varied-load" | "build-reps" | "low-rir" | "ready";
export interface ProgressionHint { kind: ProgressionKind; text: string }

// This is a conservative comparison with today's prescription, not an automatic
// load change. Only the most recent real session of this specific plan counts.
export function progressionHint(sessions: ExerciseSession[], planId: string, prescription: Prescription, duplicatePrescription = false): ProgressionHint {
  if (["Aquecimento", "Ativação", "Mobilidade"].includes(prescription.role)) return { kind: "not-applicable", text: "Esta prescrição é de aquecimento, ativação ou mobilidade; a regra de progressão de carga não se aplica automaticamente." };
  const previous = sessions.find(session => session.log.planId === planId);
  if (!previous) return { kind: "no-history", text: "Sem histórico real deste exercício neste treino. Escolha uma carga adequada para começar." };
  if (duplicatePrescription || previous.log.entries.filter(entry => entry.exerciseId === prescription.exerciseId).length > 1) return { kind: "ambiguous", text: "Este exercício aparece mais de uma vez na sessão ou no plano. Compare cada bloco manualmente antes de ajustar a carga." };
  const sets = previous.sets;
  if (sets.length < prescription.sets) return { kind: "partial", text: `Na última sessão deste treino, foram registradas ${sets.length} de ${prescription.sets} séries de trabalho previstas. Compare novamente após completar a prescrição.` };
  if (sets.some(set => set.rir == null)) return { kind: "unknown-effort", text: "O RIR não foi registrado em todas as séries de trabalho. Avalie o esforço antes de decidir se aumenta a carga." };
  if (sets.some(set => set.weight === 0)) return { kind: "bodyweight", text: "Há séries com carga externa zero. Acompanhe repetições e execução; o app não sugere aumento de carga para elas." };
  if (new Set(sets.map(set => set.weight)).size > 1) return { kind: "varied-load", text: "As cargas variaram entre séries. Compare cada série manualmente antes de ajustar o peso." };
  if (sets.some(set => set.rir! < prescription.rir)) return { kind: "low-rir", text: `Em pelo menos uma série, o RIR ficou abaixo da meta atual de ${prescription.rir}. Considere manter ou ajustar a carga.` };
  if (sets.some(set => set.reps < prescription.repsMax)) return { kind: "build-reps", text: `Ainda há séries abaixo de ${prescription.repsMax} repetições. Procure avançar na faixa mantendo a técnica e o RIR planejado.` };
  return { kind: "ready", text: `As séries de trabalho registradas atingiram ${prescription.repsMax} repetições com pelo menos ${prescription.rir} RIR. Se a execução estiver boa, considere o menor aumento de carga disponível.` };
}

export interface StrengthPoint {
  log: WorkoutLog;
  bestSet: LoggedSet;
  estimate: number;
}

export function strengthHistory(logs: WorkoutLog[], exerciseId: string, options: { includeExamples?: boolean; since?: number; until?: number } = {}): StrengthPoint[] {
  return exerciseSessions(logs, exerciseId, options).flatMap(({ log, sets }) => {
    // A zero means bodyweight or unspecified external load, not the total load.
    const weighted = sets.filter(set => set.weight > 0);
    if (!weighted.length) return [];
    const bestSet = weighted.reduce((best, set) => e1rm(set.weight, set.reps) > e1rm(best.weight, best.reps) ? set : best);
    return [{ log, bestSet, estimate: e1rm(bestSet.weight, bestSet.reps) }];
  }).reverse();
}
