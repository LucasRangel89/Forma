import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexedDB as fakeIDB } from 'fake-indexeddb';
import {
  CATALOG, buildCatalogIndex, validateExercise, MUSCLES, MUSCLE_IDS, GROUPS, GROUP_IDS, LEGACY_GROUPS,
  computeFatigue, fatigueBoxes, volumeReport, weeklyVolume, rolling7Volume, isEffectiveSet, sessionContribution,
  orderEntries, substitutes, planWarnings, importDiario, matchExercise, mappingKey,
  createStore, memoryBackend, indexedDbBackend, normalize, weekStart, addDays, fatigueState
} from '../src/index.js';

const index = buildCatalogIndex();
const ex = id => index.byId.get(id);
const sets = (n, extra = {}) => Array.from({ length: n }, () => ({ reps: 10, weight: 50, rir: 2, ...extra }));
const sess = (date, entries) => ({ id: date, date, entries });
const near = (a, b, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

// ---------------- taxonomia e catálogo ----------------
test('taxonomia: 22 porções, cada uma em 1 grupo e 1 grupo legado válidos', () => {
  assert.equal(MUSCLE_IDS.length, 22);
  for (const id of MUSCLE_IDS) {
    assert.ok(GROUP_IDS.includes(MUSCLES[id].group), id);
    assert.ok(LEGACY_GROUPS.includes(MUSCLES[id].legacy), id);
  }
  for (const g of GROUP_IDS) assert.ok(MUSCLE_IDS.some(m => MUSCLES[m].group === g), `grupo vazio: ${g}`);
});

test('catálogo: ≥120 exercícios, ids únicos, facetas válidas, mecânica derivada de joints', () => {
  assert.ok(CATALOG.length >= 120, `só ${CATALOG.length}`);
  assert.equal(new Set(CATALOG.map(e => e.id)).size, CATALOG.length);
  for (const e of CATALOG) {
    assert.deepEqual(validateExercise(e), [], e.id);
    assert.equal(e.mechanic, e.joints > 1 ? 'composto' : 'isolador', e.id);
  }
  assert.ok(CATALOG.some(e => e.mechanic === 'isolador') && CATALOG.some(e => e.mechanic === 'composto'));
});

// ---------------- séries e volume ----------------
test('série efetiva: aquecimento, não concluída e RIR>3 não contam; RIR vazio conta', () => {
  assert.equal(isEffectiveSet({ reps: 10, rir: 2 }), true);
  assert.equal(isEffectiveSet({ reps: 10, rir: null }), true);
  assert.equal(isEffectiveSet({ reps: 10, rir: 4 }), false);
  assert.equal(isEffectiveSet({ reps: 10, warmup: true }), false);
  assert.equal(isEffectiveSet({ reps: 10, done: false }), false);
});

test('volume: 10 séries de supino = 10 no peito e 5×peso nos secundários; grupo não infla', () => {
  const s = sess('2026-10-07', [{ exerciseId: 'supino-reto-com-barra', sets: sets(10) }]);
  const c = sessionContribution(s, index);
  near(c.portions.peito_esternal.sets, 10, 0.01);
  near(c.portions.triceps_lateral.sets, 10 * 0.6 * 0.5, 0.01);
  near(c.groups.peito, 10, 0.01);      // maior peso do grupo, não a soma das 3 porções
  near(c.groups.triceps, 3, 0.01);
  near(c.groups.ombros, 3, 0.01);
});

test('volume: semana calendário (seg–dom) × 7 dias móveis', () => {
  assert.equal(weekStart('2026-10-08'), '2026-10-05'); // quinta -> segunda
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // domingo -> segunda anterior
  const ss = [sess('2026-10-04', [{ exerciseId: 'supino-reto-com-barra', sets: sets(4) }]),  // domingo da semana passada
              sess('2026-10-06', [{ exerciseId: 'supino-reto-com-barra', sets: sets(6) }])];
  near(weeklyVolume(ss, index, '2026-10-08').groups.peito, 6, 0.01);
  near(rolling7Volume(ss, index, '2026-10-08').groups.peito, 10, 0.01);
});

test('relatório de volume classifica contra min/meta/máx', () => {
  const ss = [sess('2026-10-06', [{ exerciseId: 'supino-reto-com-barra', sets: sets(14) }])];
  const r = volumeReport(ss, index, '2026-10-08').find(x => x.group === 'peito');
  assert.equal(r.status, 'meta');
  assert.equal(volumeReport([], index, '2026-10-08').find(x => x.group === 'peito').status, 'abaixo_do_minimo');
});

// ---------------- fadiga (testes de referência) ----------------
test('REFERÊNCIA: 10 séries, τ=1,5 → 100% / 51% / 26% / 13% em 0/1/2/3 dias', () => {
  const s = [sess('2026-10-01', [{ exerciseId: 'rosca-direta-com-barra', sets: sets(10, { rir: 2 }) }])];
  const expected = { '2026-10-01': 100, '2026-10-02': 51, '2026-10-03': 26, '2026-10-04': 13 };
  for (const [d, pct] of Object.entries(expected)) near(computeFatigue(s, index, d).portions.biceps, pct, 0.6);
});

test('fadiga: sessões acumulam; τ maior para músculos grandes; futuro é ignorado', () => {
  const two = [sess('2026-10-06', [{ exerciseId: 'rosca-direta-com-barra', sets: sets(5) }]), sess('2026-10-07', [{ exerciseId: 'rosca-direta-com-barra', sets: sets(5) }])];
  const f = computeFatigue(two, index, '2026-10-08').portions.biceps;
  const manual = (5 * Math.exp(-2 / 1.5) + 5 * Math.exp(-1 / 1.5)) / 10 * 100;
  near(f, manual, 0.2);
  const big = [sess('2026-10-01', [{ exerciseId: 'agachamento-livre', sets: sets(10) }])];
  near(computeFatigue(big, index, '2026-10-02').portions.quadriceps, 10 * Math.exp(-1 / 2) * 10, 0.6); // τ=2 → 60,7%
  assert.equal(computeFatigue(big, index, '2026-09-30').portions.quadriceps, 0); // antes do treino
});

test('fadiga: falha pesa mais, RIR alto pesa menos; aquecimento não gera fadiga', () => {
  const mk = extra => [sess('2026-10-01', [{ exerciseId: 'rosca-direta-com-barra', sets: sets(5, extra) }])];
  const base = computeFatigue(mk({ rir: 2 }), index, '2026-10-01').portions.biceps;
  assert.ok(computeFatigue(mk({ rir: 0, failure: true }), index, '2026-10-01').portions.biceps > base);
  assert.equal(computeFatigue(mk({ warmup: true }), index, '2026-10-01').portions.biceps, 0);
  assert.equal(computeFatigue(mk({ rir: 5 }), index, '2026-10-01').portions.biceps, 0); // RIR>3 = não efetiva
});

test('check-in desloca só músculos já fatigados; nota 3 é neutra', () => {
  const s = [sess('2026-10-07', [{ exerciseId: 'rosca-direta-com-barra', sets: sets(10) }])];
  const base = computeFatigue(s, index, '2026-10-08');
  const bad = computeFatigue(s, index, '2026-10-08', undefined, [{ date: '2026-10-08', score: 1 }]);
  const neutral = computeFatigue(s, index, '2026-10-08', undefined, [{ date: '2026-10-08', score: 3 }]);
  assert.ok(bad.portions.biceps > base.portions.biceps);
  assert.equal(neutral.portions.biceps, base.portions.biceps);
  assert.equal(bad.portions.quadriceps, 0); // músculo descansado não "ganha" fadiga
});

test('boxes de fadiga: 7 grupos legados, 5 estados', () => {
  const s = [sess('2026-10-08', [{ exerciseId: 'supino-reto-com-barra', sets: sets(10) }])];
  const boxes = fatigueBoxes(computeFatigue(s, index, '2026-10-08'));
  assert.equal(boxes.length, 7);
  assert.equal(boxes.find(b => b.id === 'Peito').state, 'exhausted');
  assert.equal(boxes.find(b => b.id === 'Pernas').state, 'ready');
  assert.deepEqual([100, 60, 30, 15, 0].map(p => fatigueState(p).key), ['exhausted', 'high', 'mid', 'low', 'ready']);
});

test('registro sem vínculo usa fallback do grupo legado', () => {
  const s = [sess('2026-10-08', [{ exerciseId: null, legacy: { name: 'X', muscle: 'Pernas' }, sets: sets(10) }])];
  const f = computeFatigue(s, index, '2026-10-08');
  assert.equal(f.legacy['Pernas'], 100);
  assert.equal(f.legacy['Peito'], 0);
});

// ---------------- ordenação, substituição, avisos ----------------
test('ordenação: aquecimento/ativação → principal → acessório → isolador → finalizador', () => {
  const entries = [
    { exerciseId: 'elevacao-lateral-com-halteres', role: 'isolador' },
    { exerciseId: 'face-pull', role: 'ativacao' },
    { exerciseId: 'supino-inclinado-com-halteres', role: 'acessorio' },
    { exerciseId: 'supino-reto-com-barra', role: 'principal' },
    { exerciseId: 'crossover-polia-alta', role: 'finalizador' }
  ];
  assert.deepEqual(orderEntries(entries, index).map(e => e.role), ['ativacao', 'principal', 'acessorio', 'isolador', 'finalizador']);
});

test('substituição respeita equipamento, restrições e nível, ordenando por SFR', () => {
  const alt = substitutes(ex('supino-reto-com-barra'), index, { equipment: ['maquina', 'halter', 'banco'], restrictions: ['ombro'], level: 'intermediario' });
  assert.ok(alt.length > 0);
  for (const a of alt) { assert.ok(!a.restrictions.includes('ombro')); assert.ok(a.equipment.every(e => ['maquina', 'halter', 'banco'].includes(e))); }
  assert.ok(alt.every((a, i) => i === 0 || alt[i - 1].sfr >= a.sfr));
});

test('avisos: volume por sessão, restrição, alta demanda sistêmica — nunca bloqueiam', () => {
  const entries = [
    { exerciseId: 'agachamento-livre', targetSets: 6 }, { exerciseId: 'levantamento-terra-convencional', targetSets: 6 },
    { exerciseId: 'leg-press-45', targetSets: 6 }
  ];
  const w = planWarnings(entries, index, null, { restrictions: ['joelho'] });
  assert.ok(w.some(x => x.type === 'sistemica'));
  assert.ok(w.some(x => x.type === 'restricao'));
  assert.ok(w.some(x => x.type === 'volume'));
});

// ---------------- importador do Diário ----------------
const backup = JSON.parse(readFileSync(new URL('./fixtures/diario-backup.json', import.meta.url)));

test('importador: TODOS os exercícios do construtor do Diário casam automaticamente', () => {
  const r = importDiario({ logs: backup.logs.filter(l => l.id < 2000) }, index);
  assert.equal(r.pending.length, 0, JSON.stringify(r.pending));
  assert.equal(r.stats.unlinked, 0);
  assert.equal(r.stats.logs, backup.logs.filter(l => l.id < 2000).length);
});

test('importador: nomes sujos casam; os realmente desconhecidos ficam pendentes (com sugestões)', () => {
  const r = importDiario(backup, index);
  const dirty = r.sessions.flatMap(s => s.entries).filter(e => e.id.match(/diario-200\d/));
  const byName = n => dirty.find(e => e.legacy.name === n);
  assert.equal(byName('supino  reto').exerciseId, 'supino-reto-com-barra');
  assert.equal(byName('SUPINO INCLINADO C/ HALTERES').exerciseId, 'supino-inclinado-com-halteres');
  assert.equal(byName('Triceps Pulley').exerciseId, 'triceps-pulley-com-barra');
  assert.equal(byName('agachamento').exerciseId, 'agachamento-livre');
  assert.equal(byName('Treino maluco funcional').exerciseId, null);
  assert.ok(r.pending.some(p => p.name === 'Treino maluco funcional'));
});

test('importador: o nome vale mais que o rótulo de grupo; na busca aproximada o grupo desempata', () => {
  const m = matchExercise('Levantamento Terra', 'Costas', index);        // Diário lança Terra em Costas
  assert.equal(m.status, 'matched'); assert.equal(m.exercise.id, 'levantamento-terra-convencional'); assert.equal(m.groupMismatch, true);
  assert.equal(matchExercise('Prancha', 'Abdômen', index).groupMismatch, false);
  assert.equal(matchExercise('extensora especial', 'Peito', index).status, 'pending');     // fraco + grupo divergente
  assert.equal(matchExercise('Treino maluco', 'Geral', index).status, 'pending');
});

test('importador: idempotente, converte séries e planos, e aceita decisões do usuário', () => {
  const a = importDiario(backup, index), b = importDiario(backup, index);
  assert.deepEqual(a.sessions.map(s => s.id), b.sessions.map(s => s.id));
  const entry = a.sessions.flatMap(s => s.entries).find(e => e.id === 'diario-1000');
  assert.deepEqual(entry.sets.map(s => s.reps), [10, 8, 8]);
  assert.ok(entry.sets.every(s => s.weight === 20 && s.rir === null && s.warmup === false));
  assert.equal(a.plans[0].exercises[0].exerciseId, 'supino-reto-com-barra');
  assert.equal(a.profile.bodyweight, 82);
  const key = mappingKey('Treino maluco funcional', 'Geral');
  const c = importDiario(backup, index, { [key]: 'unlinked', [mappingKey('Cadeira Extensora Especial XYZ', 'Pernas')]: 'cadeira-extensora' });
  assert.ok(!c.pending.some(p => p.name === 'Treino maluco funcional'));
  assert.equal(c.stats.viaUser, 1);
});

test('importador + motor: histórico do Diário gera boxes de fadiga coerentes', () => {
  const r = importDiario(backup, index);
  const boxes = fatigueBoxes(computeFatigue(r.sessions, index, '2026-10-08'));
  assert.equal(boxes.length, 7);
  assert.ok(boxes.some(b => b.pct > 0));
});

// ---------------- armazenamento local ----------------
for (const [name, mk] of [['memória', () => memoryBackend()], ['IndexedDB', () => indexedDbBackend('t-' + Math.random(), fakeIDB)]]) {
  test(`store (${name}): gravar, ler, exportar, importar e idempotência`, async () => {
    const st = createStore(mk());
    const r = importDiario(backup, index);
    await st.applyImport(r); await st.applyImport(r);                 // 2× = sem duplicar
    assert.equal((await st.all('sessions')).length, r.sessions.length);
    assert.equal((await st.getSettings()).bodyweight, 82);
    await st.saveMappings({ a: 'b' }); assert.deepEqual(await st.getMappings(), { a: 'b' });
    const dump = JSON.parse(JSON.stringify(await st.exportAll()));
    const st2 = createStore(mk());
    await st2.importAll(dump);
    assert.equal((await st2.all('sessions')).length, r.sessions.length);
    assert.equal((await st2.sessionsSorted())[0].date <= (await st2.sessionsSorted()).at(-1).date, true);
    await assert.rejects(() => st2.importAll({ foo: 1 }));
  });
}
