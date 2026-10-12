import { type AppData, type Exercise, type Muscle, type Prescription, type Settings, type WorkoutLog, type WorkoutPlan, COARSE_GROUPS, MUSCLE_GROUPS, MUSCLE_LABELS } from "./types";
const DAY = 86400000;
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const e1rm = (weight: number, reps: number) => (!weight || !reps ? 0 : reps <= 1 ? weight : weight * (1 + reps / 30));
export function recentLogs(logs: WorkoutLog[], now = new Date(), days = 7) {
  const end = now.getTime();
  return logs.filter(l => new Date(l.date).getTime() > end - days * DAY && new Date(l.date).getTime() <= end);
}
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function isEffectiveSet(s: { completed: boolean; warmup?: boolean; rir: number | null }) {
  return !s.warmup && s.completed && (s.rir == null || s.rir <= 3);
}
export function logEffectiveSets(log: WorkoutLog) {
  return log.entries.reduce((n, e) => n + e.sets.filter(isEffectiveSet).length, 0);
}
export function muscleVolume(logs: WorkoutLog[], exercises: Exercise[], settings: Settings): Record<Muscle, number> {
  const result = Object.fromEntries(Object.keys(MUSCLE_LABELS).map(m => [m, 0])) as Record<Muscle, number>;
  const catalog = new Map(exercises.map(e => [e.id, e]));
  for (const log of logs) for (const entry of log.entries) {
    const exercise = catalog.get(entry.exerciseId);
    if (!exercise || exercise.roles.every(r => ["Mobilidade", "Aquecimento", "Ativação"].includes(r))) continue;
    const sets = entry.sets.filter(isEffectiveSet).length;
    for (const m of exercise.primary) result[m.muscle] += sets * m.weight;
    for (const m of exercise.secondary) result[m.muscle] += sets * m.weight * settings.indirectWeight;
  }
  return result;
}
export function windowedLogs(data: AppData, window: "week" | "rolling", now = new Date()) {
  const start = window === "week" ? weekStart(now).getTime() : now.getTime() - 7 * DAY;
  return data.logs.filter(l => { const t = new Date(l.date).getTime(); return t >= start && t <= now.getTime(); });
}
export function weeklyVolume(data: AppData, now = new Date(), window: "week" | "rolling" = "week") {
  const volume = muscleVolume(windowedLogs(data, window, now), data.exercises, data.settings);
  return MUSCLE_GROUPS.map(group => ({ ...group, target: data.settings.targets[group.id] ?? group.target,
    value: Math.round(group.muscles.reduce((sum, m) => sum + volume[m], 0) * 10) / 10,
  }));
}
export function rirFactor(rir: number | null, f: Settings["rirFactors"]) {
  if (rir == null) return f.rir3;
  if (rir <= 0) return f.falha;
  if (rir <= 1) return f.rir1;
  if (rir <= 3) return f.rir3;
  return f.acima;
}
export function fatigue(data: AppData, now = new Date()): Record<Muscle, number> {
  const result = Object.fromEntries(Object.keys(MUSCLE_LABELS).map(m => [m, 0])) as Record<Muscle, number>;
  const catalog = new Map(data.exercises.map(e => [e.id, e]));
  const large: Muscle[] = ["quadriceps", "posterior", "gluteos", "adutores", "dorsais", "lombar"];
  for (const log of recentLogs(data.logs, now, 21)) {
    const days = Math.max(0, (now.getTime() - new Date(log.date).getTime()) / DAY);
    for (const entry of log.entries) {
      const ex = catalog.get(entry.exerciseId);
      if (!ex || ex.roles.every(r => ["Mobilidade", "Aquecimento", "Ativação"].includes(r))) continue;
      const load = entry.sets.filter(s => s.completed && !s.warmup).reduce((sum, s) => sum + rirFactor(s.rir, data.settings.rirFactors), 0);
      if (!load) continue;
      const contributions = [...ex.primary, ...ex.secondary.map(m => ({ ...m, weight: m.weight * data.settings.indirectWeight }))];
      for (const m of contributions) {
        const tau = large.includes(m.muscle) ? data.settings.largeTau : data.settings.smallTau;
        result[m.muscle] += load * m.weight * Math.exp(-days / tau) / 10 * 100;
      }
    }
  }
  const check = data.settings.checkIn;
  const checkAge = check ? now.getTime() - new Date(check.date).getTime() : -1;
  const adjustment = check && checkAge >= 0 && checkAge < DAY ? (3 - check.score) * 5 : 0;
  for (const muscle of Object.keys(result) as Muscle[]) result[muscle] = Math.round(clamp(result[muscle] + adjustment));
  return result;
}
export interface FatigueStateInfo { id: string; label: string; level: number }
export function fatigueState(v: number, scale: Settings["fatigueScale"]): FatigueStateInfo {
  if (v >= scale.exausto) return { id: "exausto", label: "Exausto", level: 4 };
  if (v >= scale.fadigado) return { id: "fadigado", label: "Fadigado", level: 3 };
  if (v >= scale.recuperando) return { id: "recuperando", label: "Recuperando", level: 2 };
  if (v >= scale.quasePronto) return { id: "quase", label: "Quase pronto", level: 1 };
  return { id: "pronto", label: "Pronto", level: 0 };
}
export const STATE_COLORS: Record<string, string> = { pronto: "#739583", quase: "#9ab58b", recuperando: "#d2bc86", fadigado: "#c69875", exausto: "#b5563d" };
export function groupFatigue(recovery: Record<Muscle, number>, muscles: Muscle[]) {
  return Math.round(muscles.reduce((n, m) => n + recovery[m], 0) / muscles.length);
}
export function readiness(data: AppData, now = new Date()) {
  const values = Object.values(fatigue(data, now));
  return Math.round(100 - values.reduce((a, b) => a + b, 0) / values.length);
}
export function lastPerformance(data: AppData, exerciseId: string) {
  const log = [...data.logs].sort((a, b) => b.date.localeCompare(a.date)).find(l => l.entries.some(e => e.exerciseId === exerciseId));
  if (!log) return null;
  const entry = log.entries.find(e => e.exerciseId === exerciseId)!;
  const done = entry.sets.filter(s => s.completed && !s.warmup);
  if (!done.length) return null;
  const best = done.reduce((a, b) => e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a);
  return { weight: best.weight, reps: best.reps, e1rm: Math.round(e1rm(best.weight, best.reps) * 10) / 10, date: log.date };
}
export function personalBest(data: AppData, exerciseId: string) {
  let best: { weight: number; reps: number; e1rm: number } | null = null;
  for (const log of data.logs) for (const entry of log.entries) if (entry.exerciseId === exerciseId)
    for (const s of entry.sets) if (s.completed && !s.warmup) {
      const v = { weight: s.weight, reps: s.reps, e1rm: Math.round(e1rm(s.weight, s.reps) * 10) / 10 };
      if (!best || v.e1rm > best.e1rm) best = v;
    }
  return best;
}
export function streakDays(data: AppData, now = new Date()) {
  const days = new Set(data.logs.map(l => new Date(l.date).toDateString()));
  if (!days.size) return 0;
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
export function totalXp(data: AppData) {
  let xp = 0;
  for (const l of data.logs) {
    if (!l.entries.some(e => e.sets.some(s => s.completed))) continue;
    xp += l.entries.reduce((n, e) => n + e.sets.filter(isEffectiveSet).length, 0) + 5;
  }
  return xp;
}
export const RANKS: [number, string][] = [[0, "Iniciante"], [150, "Adepto"], [400, "Atleta"], [800, "Guerreiro"], [1400, "Campeão"], [2500, "Lenda"]];
export function rankInfo(xp: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i][0]) idx = i;
  const next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  const base = RANKS[idx][0];
  const progress = next ? (xp - base) / (next[0] - base) : 1;
  return { name: RANKS[idx][1], xp, nextName: next?.[1] ?? null, nextXp: next?.[0] ?? null, progress: clamp(progress, 0, 1) };
}
export function bossInfo(data: AppData, now = new Date()) {
  const v = weeklyVolume(data, now, "week");
  const coverage = v.reduce((s, g) => s + Math.min(g.value / Math.max(g.target, 1), 1), 0) / v.length;
  return { coverage, defeated: coverage >= 1, percent: Math.round(coverage * 100) };
}
export function storyCard(data: AppData, now = new Date()) {
  const ws = weekStart(now);
  const prevStart = new Date(ws);
  prevStart.setDate(prevStart.getDate() - 7);
  const logs = data.logs.filter(l => { const t = new Date(l.date).getTime(); return t >= prevStart.getTime() && t < ws.getTime(); });
  const sets = logs.reduce((n, l) => n + logEffectiveSets(l), 0);
  const tonnage = logs.reduce((n, l) => n + l.entries.reduce((x, e) => x + e.sets.filter(s => s.completed && !s.warmup).reduce((y, s) => y + s.reps * s.weight, 0), 0), 0);
  const title = sets >= 70 ? "Semana de ferro" : logs.length >= 4 ? "Constância premiada" : logs.length >= 2 ? "Base sólida" : "Toda lenda começa leve";
  return { sessions: logs.length, sets, tonnage, title };
}
export function planMinutes(plan: WorkoutPlan) {
  return Math.round(6 + plan.exercises.reduce((n, p) => n + p.sets * (40 + p.rest) / 60 + 1, 0));
}
export function totalSets(plan: WorkoutPlan) { return plan.exercises.reduce((sum, p) => sum + p.sets, 0); }
export function logSets(log: WorkoutLog) { return log.entries.reduce((sum, e) => sum + e.sets.filter(s => s.completed).length, 0); }
export function logTonnage(log: WorkoutLog) { return log.entries.reduce((sum, e) => sum + e.sets.filter(s => s.completed && !s.warmup).reduce((n, s) => n + s.reps * s.weight, 0), 0); }
export function recommendation(data: AppData, now = new Date()) {
  const recovery = fatigue(data, now);
  const volumes = weeklyVolume(data, now, "week");
  const daysLeft = Math.max(1, 7 - ((now.getDay() + 6) % 7));
  const candidates = data.plans.map(plan => {
    const muscles = new Set<Muscle>();
    plan.exercises.forEach(p => data.exercises.find(e => e.id === p.exerciseId)?.primary.forEach(m => muscles.add(m.muscle)));
    const covered = volumes.filter(v => v.muscles.some(m => muscles.has(m)));
    const last = data.logs.filter(l => l.planId === plan.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const daysSince = last ? Math.max(0, (now.getTime() - new Date(last.date).getTime()) / DAY) : 14;
    let score = covered.reduce((sum, group) => {
      const need = Math.max(0, group.target - group.value) / daysLeft;
      const avgFatigue = group.muscles.reduce((n, m) => n + recovery[m], 0) / group.muscles.length;
      return sum + need * (1 - avgFatigue / 100) - (avgFatigue > data.settings.fatigueScale.fadigado ? 5 : 0);
    }, 0);
    score += Math.min(daysSince, 10) * .65;
    score += data.settings.priorities.filter(m => muscles.has(m)).length * 2;
    const avgReadiness = muscles.size ? 100 - [...muscles].reduce((n, m) => n + recovery[m], 0) / muscles.size : 100;
    const reasons = [
      `${Math.round(avgReadiness)}% de prontidão estimada nos músculos deste treino.`,
      covered.length ? `${covered.sort((a, b) => (b.target - b.value) - (a.target - a.value))[0].label} ainda tem espaço na meta semanal.` : "Este treino amplia a variedade de movimentos.",
      daysSince >= 2 ? `O intervalo desde a última sessão favorece a recuperação (${Math.floor(daysSince)} dias).` : "Este treino foi feito recentemente. Considere reduzir o volume conforme sua disposição.",
      data.settings.priorities.some(m => muscles.has(m)) ? "Inclui músculos que você definiu como prioridade." : "Complementa os padrões de movimento da sua semana.",
    ];
    return { plan, score, readiness: Math.round(avgReadiness), reasons };
  }).sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}
const roleRank: Record<string, number> = { Aquecimento: 0, Ativação: 1, Mobilidade: 2, Principal: 3, Acessório: 4, Isolador: 5, Finalizador: 6 };
const demandRank: Record<string, number> = { Alta: 3, Média: 2, Baixa: 1 };
export function orderExercises(prescriptions: Prescription[], exercises: Exercise[], priorities: Muscle[] = []) {
  return [...prescriptions].sort((a, b) => {
    if (roleRank[a.role] !== roleRank[b.role]) return roleRank[a.role] - roleRank[b.role];
    const exA = exercises.find(e => e.id === a.exerciseId), exB = exercises.find(e => e.id === b.exerciseId);
    if (!exA || !exB) return 0;
    const weight = (e: Exercise) => demandRank[e.systemic] * 10 + demandRank[e.technical] * 3 + (e.primary.some(m => priorities.includes(m.muscle)) ? 2 : 0);
    return weight(exB) - weight(exA);
  });
}
export function planWarnings(plan: WorkoutPlan, data: AppData) {
  const warnings: string[] = [];
  const muscles: Record<string, number> = {};
  const recovery = fatigue(data);
  let high = 0;
  for (const p of plan.exercises) {
    const e = data.exercises.find(ex => ex.id === p.exerciseId);
    if (!e) continue;
    if (e.systemic === "Alta") high++;
    e.primary.forEach(m => { muscles[m.muscle] = (muscles[m.muscle] ?? 0) + p.sets * m.weight; });
    e.secondary.forEach(m => { muscles[m.muscle] = (muscles[m.muscle] ?? 0) + p.sets * m.weight * data.settings.indirectWeight; });
    if (e.restrictions.some(r => data.settings.restrictions.includes(r))) warnings.push(`${e.name}: atenção à sua restrição de ${e.restrictions.filter(r => data.settings.restrictions.includes(r)).join(", ").toLowerCase()}.`);
  }
  for (const [muscle, sets] of Object.entries(muscles)) {
    if (sets > data.settings.sessionCap) warnings.push(`${MUSCLE_LABELS[muscle as Muscle]}: ${Math.round(sets)} séries nesta sessão, acima do seu limite de ${data.settings.sessionCap}.`);
    if (recovery[muscle as Muscle] > data.settings.fatigueScale.fadigado) warnings.push(`${MUSCLE_LABELS[muscle as Muscle]} está com ${recovery[muscle as Muscle]}% de fadiga estimada (estado: ${fatigueState(recovery[muscle as Muscle], data.settings.fatigueScale).label}).`);
  }
  if (high > 1) warnings.push(`${high} exercícios de alta demanda sistêmica. Considere manter apenas um.`);
  if (planMinutes(plan) > data.settings.sessionMinutes) warnings.push(`A sessão pode ultrapassar os ${data.settings.sessionMinutes} minutos que você tem disponíveis.`);
  if (totalSets(plan) > 25) warnings.push("Mais de 25 séries na sessão. Observe a qualidade das últimas séries.");
  return warnings;
}
export function substitutions(exercise: Exercise, data: AppData) {
  const levels = ["Iniciante", "Intermediário", "Avançado"];
  return data.exercises.filter(e => e.id !== exercise.id && e.pattern === exercise.pattern && e.primary.some(m => exercise.primary.some(p => p.muscle === m.muscle)) && e.equipment.every(eq => data.settings.equipment.includes(eq)) && !e.restrictions.some(r => data.settings.restrictions.includes(r)) && levels.indexOf(e.level) <= levels.indexOf(data.settings.level)).sort((a, b) => b.sfr - a.sfr).slice(0, 5);
}
export function generateProgram(data: AppData): WorkoutPlan[] {
  const { settings, exercises } = data;
  const splits = settings.days <= 3 ? Array(settings.days).fill("Full body") as string[] : settings.days === 4 ? ["Upper", "Lower", "Upper", "Lower"] : settings.days === 5 ? ["Upper", "Lower", "Upper", "Lower", "Full body"] : ["Push", "Pull", "Legs", "Push", "Pull", "Legs"];
  const days = settings.days === 2 ? [1, 4] : settings.days === 3 ? [1, 3, 5] : settings.days === 4 ? [1, 2, 4, 5] : settings.days === 5 ? [1, 2, 3, 5, 6] : [1, 2, 3, 4, 5, 6];
  const recipes: Record<string, Muscle[]> = {
    Upper: ["peito-esternal", "dorsais", "peito-clavicular", "deltoide-lateral", "biceps", "triceps-longo"],
    Lower: ["quadriceps", "posterior", "gluteos", "quadriceps", "panturrilha", "abdomen"],
    "Full body": ["quadriceps", "peito-esternal", "dorsais", "posterior", "deltoide-lateral", "abdomen"],
    Push: ["peito-clavicular", "peito-esternal", "deltoide-anterior", "deltoide-lateral", "triceps-longo", "triceps-lateral"],
    Pull: ["dorsais", "trapezio-medio", "deltoide-posterior", "biceps", "braquial", "abdomen"],
    Legs: ["quadriceps", "posterior", "gluteos", "quadriceps", "panturrilha", "abdomen"],
  };
  const used = new Set<string>();
  const levels = ["Iniciante", "Intermediário", "Avançado"];
  const eligible = exercises.filter(e => e.equipment.every(eq => settings.equipment.includes(eq)) && !e.restrictions.some(r => settings.restrictions.includes(r)) && levels.indexOf(e.level) <= levels.indexOf(settings.level) && !e.roles.every(r => ["Mobilidade", "Aquecimento", "Ativação"].includes(r)));
  return splits.map((split, i) => {
    const selected: Prescription[] = [];
    let high = false;
    for (const muscle of recipes[split]) {
      const candidates = eligible.filter(e => e.primary.some(m => m.muscle === muscle && m.weight >= .3) && !selected.some(p => p.exerciseId === e.id) && !(high && e.systemic === "Alta"));
      const score = (e: Exercise) => e.sfr * 2 + (used.has(e.id) ? -3 : 2) + (settings.favorites.includes(e.id) ? 3 : 0) + (e.primary.some(m => settings.priorities.includes(m.muscle)) ? 3 : 0) + (selected.length === 0 && e.joints > 1 ? 4 : 0) + (settings.goal === "Força" && e.emphasis.includes("Força") ? 5 : 0);
      candidates.sort((a, b) => score(b) - score(a));
      const e = candidates[0];
      if (!e) continue;
      const role = e.joints > 1 ? selected.length === 0 ? "Principal" : "Acessório" : "Isolador";
      selected.push({ exerciseId: e.id, sets: settings.level === "Iniciante" ? 2 : 3, repsMin: role === "Principal" ? settings.goal === "Força" ? 4 : 6 : e.joints > 1 ? 8 : 10, repsMax: role === "Principal" ? settings.goal === "Força" ? 6 : 10 : e.joints > 1 ? 12 : 15, rir: role === "Principal" ? 2 : 1, rest: role === "Principal" ? 120 : e.joints > 1 ? 90 : 60, role, technique: "Tradicional" });
      if (e.systemic === "Alta") high = true;
      used.add(e.id);
    }
    const plan: WorkoutPlan = { id: crypto.randomUUID(), name: `${split} ${String.fromCharCode(65 + Math.floor(i / (settings.days <= 3 ? 1 : settings.days === 6 ? 3 : 2)))}`, subtitle: `${settings.goal} · ${settings.level.toLowerCase()}`, type: split === "Upper" || split === "Lower" || split === "Full body" ? split : "Personalizado", day: days[i], exercises: orderExercises(selected, exercises, settings.priorities) };
    while (planMinutes(plan) > settings.sessionMinutes && plan.exercises.length > 3) plan.exercises.pop();
    return plan;
  }).filter(p => p.exercises.length > 0);
}
export function formatNumber(value: number, digits = 0) { return value.toLocaleString("pt-BR", { maximumFractionDigits: digits }); }
export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) { return new Date(date).toLocaleDateString("pt-BR", options ?? { day: "2-digit", month: "short" }); }
export const COARSE = COARSE_GROUPS;
