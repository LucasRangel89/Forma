import assert from "node:assert/strict";
import test from "node:test";
import type { AppData, WorkoutLog } from "../src/lib/types";

// This test creates synthetic profiles and records. Never point it at a real
// deployment or database: the explicit guard makes that decision intentional.
const base = process.env.FORMA_TEST_SERVER_URL;
if (process.env.FORMA_TEST_DISPOSABLE !== "1" || !base) throw new Error("Use apenas um servidor e banco descartáveis: defina FORMA_TEST_DISPOSABLE=1 e FORMA_TEST_SERVER_URL.");
const url = new URL("/api/app", base).toString();

async function newProfile() {
  const response = await fetch(url);
  const result = await response.json() as { data: AppData; error?: string };
  assert.equal(response.status, 200, result.error);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { cookie, data: result.data };
}
async function action(cookie: string, name: string, payload: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action: name, payload }) });
  return { status: response.status, body: await response.json() as { data?: AppData; error?: string } };
}

test("API: sessão flexível, correção validada, conflito concorrente e isolamento de perfil", async () => {
  const { cookie, data } = await newProfile();
  const plan = data.plans.find(item => item.name === "Upper A")!;
  let result = await action(cookie, "logWorkout", {
    planId: plan.id, name: plan.name, date: new Date().toISOString(), duration: 31, notes: "",
    entries: [{ exerciseId: plan.exercises[0].exerciseId, sets: [
      { reps: 8, weight: 50, rir: 2, completed: true },
      { reps: 10, weight: 20, rir: null, completed: false, warmup: true },
    ] }],
  });
  assert.equal(result.status, 200, result.body.error);
  const original = result.body.data!.logs.find(log => !log.demo)!;
  assert.equal(original.entries[0].sets.length, 1);
  const changes = { name: "Sessão corrigida no teste", date: original.date, duration: 35, notes: "Primeira correção", entries: original.entries };
  result = await action(cookie, "updateLog", { expected: original, changes });
  assert.equal(result.status, 200, result.body.error);
  const edited = result.body.data!.logs.find(log => log.id === original.id)!;
  assert.equal(edited.notes, "Primeira correção");
  assert.equal(edited.planId, original.planId);
  assert.equal(edited.demo, false);
  result = await action(cookie, "updateLog", { expected: original, changes: { ...changes, notes: "Alteração antiga" } });
  assert.equal(result.status, 400);
  assert.match(result.body.error!, /alterado em outra aba/);
  result = await action(cookie, "updateLog", { expected: edited, changes: { ...changes, date: "2999-01-01T00:00:00.000Z" } });
  assert.equal(result.status, 400);
  result = await action(cookie, "updateLog", { expected: edited, changes: { ...changes, entries: [{ ...edited.entries[0], exerciseId: "ausente" }] } });
  assert.equal(result.status, 400);
  const pair = await Promise.all(["A", "B"].map(notes => action(cookie, "updateLog", { expected: edited, changes: { ...changes, notes } })));
  assert.deepEqual(pair.map(item => item.status).sort(), [200, 400]);
  const staleDelete = await action(cookie, "deleteLog", { expected: edited });
  assert.equal(staleDelete.status, 400);
  assert.match(staleDelete.body.error!, /alterado em outra aba/);
  const other = await newProfile();
  const foreign = await action(other.cookie, "updateLog", { expected: edited, changes });
  assert.equal(foreign.status, 400);
  const refresh = await fetch(url, { headers: { Cookie: cookie } });
  const updated = (await refresh.json() as { data: AppData }).data.logs.find((log: WorkoutLog) => log.id === original.id)!;
  assert.ok(["A", "B"].includes(updated.notes));
  const deleted = await action(cookie, "deleteLog", { expected: updated });
  assert.equal(deleted.status, 200, deleted.body.error);
  assert.ok(!deleted.body.data!.logs.some(log => log.id === original.id));
});
