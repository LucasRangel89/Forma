import { slug } from "./catalog";
import { matchExercise } from "./taxonomy";
import { COARSE_FALLBACK, COARSE_PATTERN, type Exercise, type WorkoutLog } from "./types";

export interface DiarioSession {
  date: string;
  name: string;
  group: string;
  weight: number;
  reps: number[];
  technique?: string;
  goal?: number;
}
export interface DiarioBuild {
  logs: Omit<WorkoutLog, "id">[];
  custom: Exercise[];
  matched: number;
  pending: { id: string; name: string }[];
}
export function buildDiarioLogs(sessions: DiarioSession[], exercises: Exercise[], aliases: Record<string, string>, ownerId: string): DiarioBuild {
  const logs: Omit<WorkoutLog, "id">[] = [];
  const custom: Exercise[] = [];
  const pending: { id: string; name: string }[] = [];
  const used = new Set<string>();
  sessions.forEach((session, i) => {
    let id = matchExercise(session.name, exercises, aliases);
    if (!id) {
      const base = slug(session.name) || "exercicio";
      id = `${base}-user-${ownerId.slice(0, 8)}`;
      let candidate = id;
      let n = 2;
      while (used.has(candidate)) candidate = `${base}-user-${ownerId.slice(0, 8)}-${n++}`;
      id = candidate;
      used.add(id);
      const goalNote = session.goal ? ` Meta do próximo treino: ${session.goal} kg.` : "";
      const techNote = session.technique ? ` Técnica: ${session.technique}.` : "";
      custom.push({
        id, name: session.name,
        primary: COARSE_FALLBACK[session.group] ?? [{ muscle: "quadriceps", weight: 1 }],
        secondary: [], pattern: COARSE_PATTERN[session.group] ?? "Puxar horizontal",
        equipment: ["Banco"], joints: 2, laterality: "Bilateral", roles: ["Acessório"],
        emphasis: ["Hipertrofia"], systemic: "Média", technical: "Baixa", level: "Iniciante",
        resistance: "Intermediário", restrictions: [], sfr: 3,
        instructions: `Importado do Diário de Cargas pelo grupo ${session.group}. Vincule este exercício a um do catálogo para refinar volume e fadiga.${goalNote}${techNote}`,
        ...(session.goal ? { goal: session.goal } : {}),
      });
      pending.push({ id, name: session.name });
    }
    logs.push({
      planId: null, name: session.name,
      date: new Date(`${session.date}T12:00:00`).toISOString(),
      duration: 0,
      entries: [{ exerciseId: id, sets: session.reps.map(r => ({ reps: r, weight: session.weight, rir: null, completed: true, warmup: false })) }],
      notes: "Importado do Diário de Cargas.", demo: false,
    });
    void i;
  });
  return { logs, custom, matched: sessions.length - pending.length, pending };
}
