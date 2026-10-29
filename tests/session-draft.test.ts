import assert from "node:assert/strict";
import test from "node:test";
import { buildDemo } from "../src/lib/demo";
import { clearSessionDraft, readSessionDraft, writeSessionDraft, type SessionDraft } from "../src/lib/session-draft";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); },
  };
}
function draft(): SessionDraft {
  const plan = buildDemo("draft").plans[0];
  return { version: 1, plan, manual: true, free: false, sessionName: plan.name, entries: [{ prescription: plan.exercises[0], sets: [{ reps: 0, weight: 10, rir: null, completed: true }] }], startedDate: "2026-10-29", date: "", duration: -1, notes: "parcial", elapsedSeconds: 12, savedAt: "2026-10-29T12:00:00.000Z" };
}

test("rascunhos preservam campos parciais e não substituem um rascunho válido por dados inválidos", () => {
  const store = memoryStorage(), saved = draft();
  assert.equal(writeSessionDraft(saved, store), true);
  assert.deepEqual(readSessionDraft(store), { kind: "ready", draft: saved });
  assert.equal(writeSessionDraft({ ...saved, duration: Number.NaN }, store), false);
  assert.deepEqual(readSessionDraft(store), { kind: "ready", draft: saved });
  assert.equal(clearSessionDraft(store), true);
  assert.equal(readSessionDraft(store), null);
});

test("rascunho de versão anterior é compatível e JSON corrompido não é apagado", () => {
  const store = memoryStorage();
  const old = { ...draft() } as Partial<SessionDraft>;
  delete old.free; delete old.sessionName;
  store.setItem("forma-session-draft-v1", JSON.stringify(old));
  const read = readSessionDraft(store);
  assert.equal(read?.kind, "ready");
  if (read?.kind === "ready") { assert.equal(read.draft.free, false); assert.equal(read.draft.sessionName, old.plan!.name); }
  store.setItem("forma-session-draft-v1", "{inválido");
  assert.deepEqual(readSessionDraft(store), { kind: "invalid" });
  assert.equal(store.getItem("forma-session-draft-v1"), "{inválido");
});

test("indisponibilidade de armazenamento é sinalizada sem lançar exceção", () => {
  const blocked = { ...memoryStorage(), getItem: () => { throw new DOMException("Bloqueado", "SecurityError"); }, setItem: () => { throw new DOMException("Sem espaço", "QuotaExceededError"); }, removeItem: () => { throw new DOMException("Bloqueado", "SecurityError"); } } as Storage;
  assert.deepEqual(readSessionDraft(blocked), { kind: "unavailable" });
  assert.equal(writeSessionDraft(draft(), blocked), false);
  assert.equal(clearSessionDraft(blocked), false);
});
