import { CATALOG, slug } from "./catalog";
import { DEFAULT_SETTINGS, type AppData, type Prescription, type WorkoutPlan } from "./types";
function p(name: string, sets = 3, repsMin = 8, repsMax = 12, role: Prescription["role"] = "Acessório"): Prescription {
  return { exerciseId: slug(name), sets, repsMin, repsMax, role, rir: role === "Principal" ? 2 : 1, rest: role === "Principal" ? 120 : role === "Acessório" ? 90 : 60, technique: "Tradicional" };
}
export function buildDemo(owner = "preview", now = new Date()): AppData {
  const plans: WorkoutPlan[] = [
    { id: `${owner}-upper-a`, name: "Upper A", subtitle: "Costas, peito e bíceps", type: "Upper", day: 1, exercises: [p("Supino reto com barra", 3, 6, 8, "Principal"), p("Remada curvada com barra"), p("Puxada aberta na polia"), p("Elevação lateral com halteres", 3, 12, 15, "Isolador"), p("Rosca direta com barra", 3, 10, 12, "Isolador"), p("Tríceps na corda", 3, 12, 15, "Isolador")] },
    { id: `${owner}-lower-a`, name: "Lower A", subtitle: "Quadríceps, glúteos e panturrilha", type: "Lower", day: 2, exercises: [p("Agachamento livre", 3, 6, 8, "Principal"), p("Leg press 45°"), p("Cadeira extensora", 3, 12, 15, "Isolador"), p("Cadeira flexora", 3, 10, 15, "Isolador"), p("Panturrilha sentada", 3, 12, 20, "Isolador"), p("Abdominal na polia", 3, 12, 15, "Isolador")] },
    { id: `${owner}-upper-b`, name: "Upper B", subtitle: "Peito, ombros e tríceps", type: "Upper", day: 4, exercises: [p("Supino inclinado com halteres", 3, 6, 10, "Principal"), p("Remada baixa com triângulo"), p("Desenvolvimento com halteres"), p("Elevação lateral na polia", 3, 12, 15, "Isolador"), p("Tríceps testa", 3, 10, 12, "Isolador"), p("Rosca alternada com halteres", 3, 10, 12, "Isolador")] },
    { id: `${owner}-lower-b`, name: "Lower B", subtitle: "Posterior, glúteos e abdômen", type: "Lower", day: 5, exercises: [p("Levantamento terra romeno", 3, 6, 8, "Principal"), p("Elevação pélvica com barra"), p("Mesa flexora", 3, 10, 15, "Isolador"), p("Agachamento búlgaro"), p("Panturrilha em pé na máquina", 3, 12, 20, "Isolador"), p("Abdominal na máquina", 3, 12, 15, "Isolador")] },
  ];
  const offsets = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26];
  const sequence = [1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 2];
  const logs = offsets.map((offset, i) => {
    const plan = plans[sequence[i]];
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    date.setHours(18, 15, 0, 0);
    return { id: `${owner}-demo-${i}`, planId: plan.id, name: plan.name, date: date.toISOString(), duration: [52, 56, 49, 54][i % 4],
      entries: plan.exercises.map((pr, j) => {
        const ex = CATALOG.find(e => e.id === pr.exerciseId)!;
        const base = ex.equipment.includes("Barra") ? 60 : ex.equipment.includes("Máquina") ? 45 : ex.equipment.includes("Halter") ? 18 : 25;
        const warmups = j === 0 ? [
          { reps: 12, weight: Math.max(2, Math.round(base / 2)), rir: null, completed: true, warmup: true },
          { reps: 10, weight: Math.max(2, Math.round(base * 0.7)), rir: null, completed: true, warmup: true },
        ] : [];
        return { exerciseId: pr.exerciseId, sets: [...warmups, ...Array.from({ length: pr.sets }, (_, s) => ({ reps: pr.repsMin + (s % 2), weight: Math.max(4, base - Math.floor(i / 4) * 2 + (j === 0 ? 4 : 0)), rir: pr.rir, completed: true }))] };
      }), notes: "Registro de exemplo para explorar seu painel. Você pode remover os exemplos em Configurações.", demo: true,
    };
  });
  return { exercises: CATALOG, plans, logs, settings: structuredClone(DEFAULT_SETTINGS), userExerciseIds: [] };
}
