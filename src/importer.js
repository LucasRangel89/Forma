// Importador do Diário de Cargas (backup JSON {logs, userBodyweight, workoutTemplates}) -> sessões e planos do modelo novo.
// Função PURA e idempotente: ids determinísticos ("diario-<id>"), então importar duas vezes não duplica.
import { normalize, tokens } from './util.js';
import { legacyGroupOfExercise } from './catalog.js';
import { LEGACY_GROUPS } from './taxonomy.js';

export const mappingKey = (name, muscle) => `${normalize(name)}|${muscle || ''}`;

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/** Procura o exercício do catálogo para um nome livre do Diário.
 *  1) nome exato  2) alias exato  → o NOME vale mais que o rótulo de grupo (ex.: "Terra" costuma ser lançado em Costas).
 *  3) similaridade de tokens → o grupo funciona como desempate (+0,1); se o grupo diverge, exige similaridade ≥ 0,9.
 *  Nunca chuta: ambiguidade ou baixa similaridade viram "pendente", com até 3 sugestões. */
export function matchExercise(name, legacyMuscle, index) {
  const n = normalize(name);
  if (!n) return { status: 'pending', candidates: [] };
  const known = LEGACY_GROUPS.includes(legacyMuscle);
  const sameGroup = ex => !known || legacyGroupOfExercise(ex) === legacyMuscle || legacyGroupOfExercise(ex) === null;

  const direct = index.byName.get(n) || index.byAlias.get(n);
  if (direct) return { status: 'matched', exercise: direct, via: index.byName.has(n) ? 'nome' : 'alias', score: 1, groupMismatch: !sameGroup(direct) };

  const qt = tokens(name);
  const ranked = index.list.map(ex => {
    const base = Math.max(...[ex.name, ...(ex.aliases || [])].map(x => jaccard(qt, tokens(x))));
    return { ex, base, score: base + (sameGroup(ex) ? 0.1 : 0) };
  }).sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name));
  const top = ranked[0], second = ranked[1];
  const candidates = ranked.slice(0, 3).filter(r => r.base > 0).map(r => ({ id: r.ex.id, name: r.ex.name, score: Math.round(r.base * 100) / 100 }));
  const okGroup = top && (sameGroup(top.ex) || top.base >= 0.9);
  if (top && okGroup && top.base >= 0.75 && (!second || top.score - second.score >= 0.15))
    return { status: 'matched', exercise: top.ex, via: 'similaridade', score: top.base, groupMismatch: !sameGroup(top.ex), candidates };
  return { status: 'pending', candidates };
}

/**
 * @param backup  JSON do backup do Diário (ou apenas { logs: [...] })
 * @param index   índice do catálogo (buildCatalogIndex)
 * @param mappings { [mappingKey]: exerciseId | 'unlinked' }  decisões do usuário para pendentes
 */
export function importDiario(backup, index, mappings = {}) {
  const logs = Array.isArray(backup) ? backup : (backup?.logs || []);
  const pendingMap = new Map();
  const stats = { logs: 0, matched: 0, viaUser: 0, unlinked: 0, skipped: 0 };
  const resolve = (name, muscle) => {
    const key = mappingKey(name, muscle);
    const user = mappings[key];
    if (user && user !== 'unlinked' && index.byId.get(user)) return { id: user, via: 'usuario' };
    if (user === 'unlinked') return { id: null, via: 'sem_vinculo' };
    const m = matchExercise(name, muscle, index);
    if (m.status === 'matched') return { id: m.exercise.id, via: m.via };
    if (!pendingMap.has(key)) pendingMap.set(key, { key, name, muscle, count: 0, candidates: m.candidates });
    pendingMap.get(key).count++;
    return { id: null, via: 'pendente' };
  };

  const byDate = new Map();
  const ordered = logs.filter(l => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date) && Array.isArray(l.reps)).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? 0) - (b.id ?? 0)));
  stats.skipped = logs.length - ordered.length;

  for (const l of ordered) {
    stats.logs++;
    const r = resolve(l.exercise, l.muscle);
    if (r.via === 'usuario') stats.viaUser++; else if (r.id) stats.matched++; else stats.unlinked++;
    const entry = {
      id: `diario-${l.id}`,
      exerciseId: r.id,
      legacy: { name: l.exercise, muscle: l.muscle },
      technique: l.technique || 'Convencional',
      nextGoal: l.nextGoal || null,
      isPR: !!l.isPR,
      sets: l.reps.filter(n => n > 0).map(reps => ({ reps, weight: Number(l.weight) || 0, rir: null, rpe: null, failure: false, warmup: false, done: true }))
    };
    if (!byDate.has(l.date)) byDate.set(l.date, { id: `diario-${l.date}`, date: l.date, source: 'diario', planId: null, durationMin: null, entries: [] });
    byDate.get(l.date).entries.push(entry);
  }

  const plans = (backup?.workoutTemplates || []).map(t => ({
    id: `diario-plan-${t.id}`, name: t.name, source: 'diario',
    exercises: (t.exercises || []).map(e => ({ exerciseId: resolve(e.exercise, e.muscle).id, legacy: { name: e.exercise, muscle: e.muscle } }))
  }));

  return {
    sessions: [...byDate.values()],
    plans,
    profile: backup?.userBodyweight ? { bodyweight: Number(backup.userBodyweight) } : {},
    pending: [...pendingMap.values()].sort((a, b) => b.count - a.count),
    stats
  };
}
