// Motor de regras: FUNÇÕES PURAS. Nada aqui lê banco, tela ou relógio.
// Entradas: sessões, catálogo (índice), configurações, data de referência ('YYYY-MM-DD').
import { MUSCLES, MUSCLE_IDS, GROUPS, GROUP_IDS, LEGACY_GROUPS, LEGACY_FALLBACK, fatigueState, groupOf, legacyOf } from './taxonomy.js';
import { dayNumber, weekStart, addDays, round } from './util.js';

export const DEFAULT_SETTINGS = {
  indirectWeight: 0.5,      // séries indiretas (músculo secundário) contam 0,5
  rirCutoff: 3,             // série com RIR > 3 não conta como "efetiva"
  sessionCap: 10,           // aviso: séries efetivas por grupo, por sessão
  refSets: 10,              // "sessão pesada" de referência (=100% de fadiga)
  smallTau: 1.5,            // dias — músculos pequenos
  largeTau: 2.0,            // dias — músculos grandes
  fatigueLimit: 60,         // % a partir do qual o assistente avisa/penaliza
  historyDays: 21,          // janela de histórico para fadiga
  checkinStep: 5,           // pontos por nível de check-in
  rirFactors: { failure: 1.25, 0: 1.25, 1: 1.1, default: 1.0, light: 0.65 }, // fator de proximidade da falha
  targets: {}               // sobrescreve GROUPS[g] = {min,target,max}
};
const cfg = s => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

// ---------------- séries ----------------
/** Série efetiva: não aquecimento, concluída, e RIR vazio (histórico antigo) ou ≤ corte. */
export function isEffectiveSet(set, settings) {
  const c = cfg(settings);
  if (set.warmup || set.done === false) return false;
  if (!(set.reps > 0)) return false;
  return set.rir == null || set.rir <= c.rirCutoff;
}

/** Fator de proximidade da falha. RIR desconhecido = neutro (1,0). */
export function proximityFactor(set, settings) {
  const f = cfg(settings).rirFactors;
  if (set.failure) return f.failure;
  if (set.rir == null) return f.default;
  if (set.rir === 0) return f[0];
  if (set.rir === 1) return f[1];
  if (set.rir <= cfg(settings).rirCutoff) return f.default;
  return f.light;
}

/** Músculos (com peso efetivo) de uma entrada. Secundário já multiplicado por indirectWeight. */
export function entryMuscles(entry, index, settings) {
  const c = cfg(settings);
  const ex = entry.exerciseId && index.byId.get(entry.exerciseId);
  if (ex) {
    if (!ex.roles.some(r => ['principal', 'acessorio', 'isolador', 'finalizador'].includes(r))) return []; // preparação não conta
    return ex.muscles.map(x => ({ m: x.m, w: x.role === 'primary' ? x.w : x.w * c.indirectWeight }));
  }
  const fb = LEGACY_FALLBACK[entry.legacy?.muscle];
  return fb ? fb.map(([m, w]) => ({ m, w })) : [];
}

/** Contribuição de UMA sessão: por porção {sets, load} e por grupo (sets). */
export function sessionContribution(session, index, settings) {
  const portions = {}, groups = {};
  for (const entry of session.entries || []) {
    const ms = entryMuscles(entry, index, settings);
    if (!ms.length) continue;
    for (const set of entry.sets || []) {
      if (!isEffectiveSet(set, settings)) continue;
      const pf = proximityFactor(set, settings);
      const perGroupMax = {};
      for (const { m, w } of ms) {
        const p = portions[m] ||= { sets: 0, load: 0 };
        p.sets += w; p.load += w * pf;
        const g = groupOf(m);
        perGroupMax[g] = Math.max(perGroupMax[g] || 0, w); // grupo: maior peso (evita inflar: supino não conta 3× peito)
      }
      for (const g in perGroupMax) groups[g] = (groups[g] || 0) + perGroupMax[g];
    }
  }
  return { portions, groups };
}

// ---------------- volume ----------------
function sumContribs(sessions, from, to, index, settings) {
  const portions = {}, groups = {};
  const a = dayNumber(from), b = dayNumber(to);
  for (const s of sessions) {
    const d = dayNumber(s.date);
    if (d < a || d > b) continue;
    const c = sessionContribution(s, index, settings);
    for (const m in c.portions) portions[m] = (portions[m] || 0) + c.portions[m].sets;
    for (const g in c.groups) groups[g] = (groups[g] || 0) + c.groups[g];
  }
  return { portions, groups };
}
/** Semana calendário (segunda a domingo) que contém refDate. Use para METAS semanais. */
export function weeklyVolume(sessions, index, refDate, settings) {
  const from = weekStart(refDate);
  return { from, to: addDays(from, 6), ...sumContribs(sessions, from, addDays(from, 6), index, settings) };
}
/** Últimos 7 dias móveis (refDate incluído). Use para PRONTIDÃO. */
export function rolling7Volume(sessions, index, refDate, settings) {
  const from = addDays(refDate, -6);
  return { from, to: refDate, ...sumContribs(sessions, from, refDate, index, settings) };
}

export function groupTarget(g, settings) {
  return { ...GROUPS[g], ...(cfg(settings).targets[g] || {}) };
}
/** Classifica séries semanais de um grupo contra min/meta/máx. */
export function volumeStatus(sets, g, settings) {
  const t = groupTarget(g, settings);
  if (sets > t.max) return 'acima_do_limite';
  if (sets >= t.max * 0.85) return 'perto_do_limite';
  if (sets >= t.target) return 'meta';
  if (sets >= t.min) return 'construindo';
  return 'abaixo_do_minimo';
}
export function volumeReport(sessions, index, refDate, settings) {
  const w = weeklyVolume(sessions, index, refDate, settings);
  return GROUP_IDS.map(g => ({ group: g, label: GROUPS[g].label, sets: round(w.groups[g] || 0), ...groupTarget(g, settings), status: volumeStatus(w.groups[g] || 0, g, settings) }));
}

// ---------------- fadiga ----------------
export const tauOf = (m, settings) => (MUSCLES[m].tauClass === 'large' ? cfg(settings).largeTau : cfg(settings).smallTau);

/**
 * Fadiga(músculo) = Σ_sessões  carga × e^(−Δdias/τ) / refSets × 100   (limitada a 0–100)
 * Sessões posteriores a refDate são ignoradas (não existe "fadiga do futuro").
 * Check-in (1–5) feito NA data de refDate desloca, em (3 − nota) × checkinStep pontos, os músculos que já têm alguma fadiga.
 */
export function computeFatigue(sessions, index, refDate, settings, checkins = []) {
  const c = cfg(settings);
  const ref = dayNumber(refDate);
  const raw = {};
  for (const s of sessions) {
    const delta = ref - dayNumber(s.date);
    if (delta < 0 || delta > c.historyDays) continue;
    const contrib = sessionContribution(s, index, settings).portions;
    for (const m in contrib) raw[m] = (raw[m] || 0) + contrib[m].load * Math.exp(-delta / tauOf(m, settings));
  }
  const ck = checkins.filter(x => x.date === refDate).sort((a, b) => (a.at || '').localeCompare(b.at || '')).pop();
  const shift = ck ? (3 - ck.score) * c.checkinStep : 0;

  const portions = {};
  for (const m of MUSCLE_IDS) {
    const base = ((raw[m] || 0) / c.refSets) * 100;
    portions[m] = Math.max(0, Math.min(100, round(base + (raw[m] ? shift : 0), 1)));
  }
  // grupo = porção mais fatigada (a mais limitante)
  const groups = {}, legacy = {};
  for (const m of MUSCLE_IDS) {
    const g = groupOf(m), l = legacyOf(m);
    groups[g] = Math.max(groups[g] || 0, portions[m]);
    legacy[l] = Math.max(legacy[l] || 0, portions[m]);
  }
  return { refDate, portions, groups, legacy, checkin: ck || null };
}

/** Dados prontos para desenhar os boxes (7 grupos legados ou 10 grupos). */
export function fatigueBoxes(fatigue, level = 'legacy') {
  const src = level === 'legacy' ? fatigue.legacy : fatigue.groups;
  const ids = level === 'legacy' ? LEGACY_GROUPS : GROUP_IDS;
  return ids.map(id => {
    const pct = Math.round(src[id] || 0);
    const st = fatigueState(pct);
    return { id, label: level === 'legacy' ? id : GROUPS[id].label, pct, state: st.key, stateLabel: st.label };
  });
}

// ---------------- ordenação ----------------
const ROLE_BLOCK = { aquecimento: 0, ativacao: 1, mobilidade: 2, principal: 3, acessorio: 4, isolador: 5, finalizador: 6 };
const SYS = { baixa: 0, media: 1, alta: 2 };
const TECH = { baixa: 0, media: 1, alta: 2 };

/** Ordena entradas de um plano: bloco por papel → (demanda sistêmica×10 + técnica×3 + prioridade) desc. Estável. */
export function orderEntries(entries, index, profile = {}) {
  const prio = new Set(profile.priorityGroups || []);
  const score = e => {
    const ex = index.byId.get(e.exerciseId);
    if (!ex) return -1;
    const grp = ex.muscles.find(m => m.role === 'primary');
    return SYS[ex.systemic] * 10 + TECH[ex.technical] * 3 + (grp && prio.has(groupOf(grp.m)) ? 2 : 0);
  };
  return entries.map((e, i) => ({ e, i }))
    .sort((a, b) => (ROLE_BLOCK[a.e.role || 'acessorio'] - ROLE_BLOCK[b.e.role || 'acessorio']) || (score(b.e) - score(a.e)) || (a.i - b.i))
    .map(x => x.e);
}

// ---------------- substituição ----------------
/** Alternativas: mesmo padrão e músculo primário em comum, compatível com equipamento/restrições/nível; maior SFR primeiro. */
export function substitutes(exercise, index, profile = {}, limit = 5) {
  const prim = new Set(exercise.muscles.filter(m => m.role === 'primary').map(m => m.m));
  const lvl = { iniciante: 0, intermediario: 1, avancado: 2 };
  const userLvl = lvl[profile.level ?? 'avancado'];
  const eq = profile.equipment ? new Set(profile.equipment) : null;
  const restr = new Set(profile.restrictions || []);
  return index.list.filter(c => c.id !== exercise.id && c.pattern === exercise.pattern
      && c.muscles.some(m => m.role === 'primary' && prim.has(m.m))
      && (!eq || c.equipment.every(x => eq.has(x)))
      && !c.restrictions.some(r => restr.has(r))
      && lvl[c.level] <= userLvl)
    .sort((a, b) => b.sfr - a.sfr || a.name.localeCompare(b.name)).slice(0, limit);
}

// ---------------- avisos (guarda-corpos, nunca bloqueios) ----------------
export function planWarnings(entries, index, fatigue, profile = {}, settings) {
  const c = cfg(settings);
  const out = [];
  const perGroup = {};
  let highSys = 0;
  for (const e of entries) {
    const ex = index.byId.get(e.exerciseId);
    if (!ex) continue;
    if (ex.systemic === 'alta') highSys++;
    const n = e.targetSets ?? (e.sets ? e.sets.length : 0);
    const fm = sessionContribution({ entries: [{ exerciseId: e.exerciseId, sets: Array.from({ length: n }, () => ({ reps: 1 })) }] }, index, settings);
    for (const g in fm.groups) perGroup[g] = (perGroup[g] || 0) + fm.groups[g];
    for (const r of ex.restrictions) if ((profile.restrictions || []).includes(r)) out.push({ type: 'restricao', msg: `"${ex.name}" exige cuidado com ${r} (restrição do seu perfil).` });
  }
  for (const g in perGroup) if (perGroup[g] > c.sessionCap) out.push({ type: 'volume', msg: `${GROUPS[g].label}: ${round(perGroup[g])} séries efetivas nesta sessão (acima de ${c.sessionCap}).` });
  if (highSys > 1) out.push({ type: 'sistemica', msg: `${highSys} exercícios de alta demanda sistêmica na mesma sessão.` });
  if (fatigue) for (const g in perGroup) if ((fatigue.groups[g] || 0) > c.fatigueLimit) out.push({ type: 'fadiga', msg: `${GROUPS[g].label} está ${Math.round(fatigue.groups[g])}% fatigado hoje.` });
  return out; // são avisos, não bloqueios
}
