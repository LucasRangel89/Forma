import assert from "node:assert/strict";
import test from "node:test";
import { exerciseSessions, progressionHint, strengthHistory } from "../src/lib/progress";
import type { LoggedSet, Prescription, WorkoutLog } from "../src/lib/types";

const prescription: Prescription = { exerciseId: "supino", sets: 2, repsMin: 8, repsMax: 12, rir: 2, rest: 90, role: "Principal", technique: "Tradicional" };
const work = (reps: number, weight = 50, rir: number | null = 2): LoggedSet => ({ reps, weight, rir, completed: true });
const log = (id: string, date: string, sets: LoggedSet[], options: Partial<WorkoutLog> = {}): WorkoutLog => ({ id, name: "Treino", planId: "plan-a", date, duration: 30, notes: "", demo: false, entries: [{ exerciseId: "supino", sets }], ...options });
const until = new Date("2026-10-20T12:00:00Z").getTime();

test("histórico filtra exemplo, futuro, aquecimento e incompletas e ordena por data", () => {
  const logs = [
    log("later", "2026-10-19T12:00:00.000Z", [work(1, 90), { ...work(15, 200), warmup: true }, { ...work(12, 300), completed: false }]),
    log("demo", "2026-10-20T10:00:00.000Z", [work(10, 250)], { demo: true }),
    log("old", "2026-10-01T12:00:00.000Z", [work(10, 50)]),
    log("future", "2026-10-21T12:00:00.000Z", [work(10, 900)]),
    log("warmup-only", "2026-10-20T11:00:00.000Z", [{ ...work(12, 500), warmup: true }]),
  ];
  assert.deepEqual(exerciseSessions(logs, "supino", { until }).map(s => s.log.id), ["later", "old"]);
  const history = strengthHistory(logs, "supino", { until });
  assert.deepEqual(history.map(s => s.log.id), ["old", "later"]);
  assert.equal(history[1].estimate, 90); // One repetition is exactly the recorded load.
  assert.equal(strengthHistory(logs, "supino", { until, includeExamples: true }).length, 3);
  assert.deepEqual(strengthHistory(logs, "supino", { until, since: new Date("2026-10-10").getTime() }).map(p => p.log.id), ["later"]);
});

test("e1RM não usa peso corporal e reúne entradas repetidas numa única sessão", () => {
  const zero = log("bodyweight", "2026-10-19T12:00:00.000Z", [work(15, 0)]);
  assert.equal(exerciseSessions([zero], "supino", { until }).length, 1);
  assert.equal(strengthHistory([zero], "supino", { until }).length, 0);
  const repeated = log("split", zero.date, [work(8, 30)], { entries: [{ exerciseId: "supino", sets: [work(8, 30)] }, { exerciseId: "supino", sets: [work(10, 50)] }] });
  const points = strengthHistory([repeated], "supino", { until });
  assert.equal(points.length, 1);
  assert.equal(points[0].bestSet.weight, 50);
});

test("dupla progressão só sugere considerar aumento com dados completos e comparáveis", () => {
  const hint = (sets: LoggedSet[], extra: Partial<WorkoutLog> = {}) => progressionHint(exerciseSessions([log("real", "2026-10-19T12:00:00.000Z", sets, extra)], "supino", { until }), "plan-a", prescription).kind;
  assert.equal(progressionHint([], "plan-a", prescription).kind, "no-history");
  assert.equal(hint([work(12)], {}), "partial");
  assert.equal(hint([work(12, 50, null), work(12)]), "unknown-effort");
  assert.equal(hint([work(12, 0), work(12, 0)]), "bodyweight");
  assert.equal(hint([work(12, 50), work(12, 55)]), "varied-load");
  assert.equal(hint([work(12, 50, 1), work(12, 50, 2)]), "low-rir");
  assert.equal(hint([work(11), work(12)]), "build-reps");
  assert.equal(hint([work(12), work(12)]), "ready");
  assert.equal(hint([work(12), work(12)], { planId: "other" }), "no-history");
  assert.equal(hint([work(12), work(12)], { demo: true }), "no-history");
});

test("prescrições e blocos repetidos não geram sugestão automática de progressão", () => {
  const repeated = log("split", "2026-10-19T12:00:00.000Z", [work(12), work(12)], { entries: [{ exerciseId: "supino", sets: [work(12)] }, { exerciseId: "supino", sets: [work(12)] }] });
  const sessions = exerciseSessions([repeated], "supino", { until });
  assert.equal(progressionHint(sessions, "plan-a", prescription).kind, "ambiguous");
  const once = exerciseSessions([log("once", repeated.date, [work(12), work(12)])], "supino", { until });
  assert.equal(progressionHint(once, "plan-a", prescription, true).kind, "ambiguous");
  assert.equal(progressionHint(once, "plan-a", { ...prescription, role: "Aquecimento" }).kind, "not-applicable");
});
