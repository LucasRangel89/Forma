import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { buildDemo } from "../src/lib/demo";
import { fatigue, groupFatigue, weeklyVolume, windowedLogs } from "../src/lib/engine";
import { loadLocalData, performLocalAction } from "../src/lib/local-store";
import { MUSCLE_LABELS, type AppData, type Muscle } from "../src/lib/types";

const backup = () => ({ version: 1, ...buildDemo("test", new Date("2026-10-20T12:00:00Z")) });
async function reset() { return performLocalAction("restoreBackup", backup()); }

test("check-in não cria fadiga em músculos sem treino e grupo usa a porção mais fatigada", () => {
  const data = buildDemo("check", new Date("2026-10-20T12:00:00Z"));
  data.logs = [];
  data.settings.checkIn = { score: 1, date: "2026-10-20T12:00:00Z" };
  const values = fatigue(data, new Date("2026-10-20T13:00:00Z"));
  assert.ok(Object.values(values).every(value => value === 0));
  const muscles = Object.fromEntries(Object.keys(MUSCLE_LABELS).map(id => [id, 0])) as Record<Muscle, number>;
  muscles["peito-esternal"] = 70;
  muscles["peito-clavicular"] = 10;
  assert.equal(groupFatigue(muscles, ["peito-esternal", "peito-clavicular"]), 70);
});

test("semana de calendário exclui a sessão do domingo anterior", () => {
  const now = new Date(2026, 9, 20, 12);
  const data = buildDemo("week", now);
  const first = data.logs[0];
  data.logs = [
    { ...first, id: "sunday", date: new Date(2026, 9, 18, 12).toISOString() },
    { ...first, id: "monday", date: new Date(2026, 9, 19, 12).toISOString() },
  ];
  assert.deepEqual(windowedLogs(data, "week", now).map(log => log.id), ["monday"]);
  assert.equal(windowedLogs(data, "rolling", now).length, 2);
  assert.ok(weeklyVolume(data, now).some(group => group.value > 0));
});

test("alterações válidas persistem e falhas de validação não substituem dados", async () => {
  const initial = await reset();
  const updated = await performLocalAction("saveSettings", { ...initial.settings, name: "Ana" });
  assert.equal(updated.settings.name, "Ana");
  assert.equal((await loadLocalData()).settings.name, "Ana");
  await assert.rejects(performLocalAction("saveSettings", { ...updated.settings, name: "" }));
  assert.equal((await loadLocalData()).settings.name, "Ana");
  await assert.rejects(performLocalAction("restoreBackup", { version: 1, ...updated, plans: [{}] }));
  assert.equal((await loadLocalData()).settings.name, "Ana");
});

test("importação do Diário é idempotente e preserva linhas idênticas do arquivo", async () => {
  const initial = await reset();
  const session = { date: "2026-10-12", name: "Giro do meu invento", group: "Pernas", weight: 20, reps: [10, 10] };
  const payload = { sessions: [session, session, { ...session, date: "2026-10-13" }] };
  const imported = await performLocalAction("importDiario", payload);
  assert.equal(imported.logs.length, initial.logs.length + 3);
  assert.equal(imported.userExerciseIds.length, 1);
  assert.equal(new Set(imported.logs.filter(log => log.id.startsWith("diario-")).map(log => log.id)).size, 3);
  const repeated = await performLocalAction("importDiario", payload);
  assert.equal(repeated.logs.length, imported.logs.length);
  assert.equal(repeated.userExerciseIds.length, 1);
  await assert.rejects(performLocalAction("importDiario", { sessions: [{ ...session, date: "2026-02-31" }] }));
  assert.equal((await loadLocalData()).logs.length, imported.logs.length);
});

test("vínculo atualiza histórico e treinos que já usam o exercício importado", async () => {
  await reset();
  const imported = await performLocalAction("importDiario", { sessions: [{ date: "2026-10-12", name: "Movimento personalizado único", group: "Pernas", weight: 20, reps: [10] }] });
  const source = imported.userExerciseIds[0];
  const target = "agachamento-livre";
  const plan = { ...imported.plans[0], exercises: [...imported.plans[0].exercises, { ...imported.plans[0].exercises[0], exerciseId: source }] };
  await performLocalAction("savePlan", plan);
  const linked = await performLocalAction("linkExercise", { exerciseId: source, targetId: target });
  assert.ok(!linked.exercises.some(exercise => exercise.id === source));
  assert.ok(linked.logs.some(log => log.name === "Movimento personalizado único" && log.entries[0].exerciseId === target));
  assert.equal(linked.plans.find(item => item.id === plan.id)?.exercises.at(-1)?.exerciseId, target);
  assert.equal(linked.settings.nameAliases["movimento personalizado unico"], target);
});

test("importação de treino inválida não deixa exercícios órfãos", async () => {
  const initial = await reset();
  const custom = { ...initial.exercises[0], id: "custom-import-test", name: "Exercício importado" };
  const plan = { ...initial.plans[0], id: "invalid-plan", exercises: [{ ...initial.plans[0].exercises[0], exerciseId: custom.id, repsMin: 20, repsMax: 5 }] };
  await assert.rejects(performLocalAction("importPlan", { plan, exercises: [custom] }));
  const after = await loadLocalData();
  assert.ok(!after.exercises.some(exercise => exercise.id === custom.id));
  assert.ok(!after.plans.some(item => item.id === plan.id));
  const valid = await performLocalAction("importPlan", { plan: { ...plan, exercises: [{ ...plan.exercises[0], repsMin: 5, repsMax: 20 }] }, exercises: [custom] });
  assert.ok(valid.plans.some(item => item.id === plan.id));
  assert.ok(valid.userExerciseIds.includes(custom.id));
});

test("backup válido pode recuperar dados locais corrompidos sem substituí-los antes da confirmação", async () => {
  await reset();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("forma-pages", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("profile", "readwrite");
    tx.objectStore("profile").put({ id: "main", version: 1, data: { broken: true } });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await assert.rejects(loadLocalData(), /não foram substituídos/);
  const restored = await performLocalAction("restoreBackup", backup());
  assert.equal(restored.plans.length, 4);
  assert.equal((await loadLocalData()).plans.length, 4);
  db.close();
});

test("operações concorrentes usam o registro mais recente", async () => {
  const initial = await reset();
  const [plan] = initial.plans;
  await Promise.all([
    performLocalAction("checkIn", 4),
    performLocalAction("savePlan", { ...plan, name: "Treino atualizado" }),
  ]);
  const result: AppData = await loadLocalData();
  assert.equal(result.settings.checkIn?.score, 4);
  assert.equal(result.plans.find(item => item.id === plan.id)?.name, "Treino atualizado");
});

test("volume semanal soma pesos das porções e respeita séries efetivas", () => {
  const now = new Date("2026-10-20T15:00:00Z");
  const data = buildDemo("volume", now);
  const log = data.logs[0];
  data.logs = [{ ...log, date: "2026-10-20T12:00:00Z", entries: [{ exerciseId: "supino-reto-com-barra", sets: [
    ...Array.from({ length: 10 }, () => ({ reps: 8, weight: 60, rir: 2, completed: true })),
    { reps: 8, weight: 60, rir: 4, completed: true },
    { reps: 8, weight: 60, rir: 2, completed: false },
    { reps: 8, weight: 20, rir: 2, completed: true, warmup: true },
  ] }] }];
  const volume = weeklyVolume(data, now);
  assert.equal(volume.find(group => group.id === "peito")?.value, 10);
  assert.equal(volume.find(group => group.id === "triceps")?.value, 5);
});
