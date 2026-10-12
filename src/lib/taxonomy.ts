import type { Exercise } from "./types";

const STRIP = ["com barra", "c barra", "c/ barra", "com halteres", "c halteres", "c/ halteres", "com halter", "c/ halter", "com peso corporal", "peso corporal", "no smith", "na smith", "com maquina", "na maquina", "maquina", "com polia", "na polia", "polia", "com kettlebell", "com elastico", "na elastico", "elastico", "livre", "halteres", "halter", "barra", "banco"];
export function normalizeName(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function strippedKey(s: string) {
  let k = normalizeName(s);
  for (const t of STRIP) k = k.split(t).join(" ");
  return k.replace(/\s+/g, " ").trim();
}
export const STATIC_ALIASES: Record<string, string> = {
  supino: "supino-reto-com-barra",
  terra: "levantamento-terra-romeno",
  stiff: "levantamento-terra-romeno",
  "leg press": "leg-press-45",
  press: "leg-press-45",
  "roca direta": "rosca-direta-com-barra",
  roca: "rosca-direta-com-barra",
  crucifixo: "crucifixo-com-halteres",
  elevacao: "elevacao-lateral-com-halteres",
  abdominal: "abdominal-na-polia",
  panturrilha: "panturrilha-em-pe-na-maquina",
  remada: "remada-curvada-com-barra",
  "barra fixa": "barra-fixa-pronada",
  puxada: "puxada-aberta-na-polia",
  desenvolvimento: "desenvolvimento-com-halteres",
  agachamento: "agachamento-livre",
  ponte: "elevacao-pelvica-com-barra",
  "terra romeno": "levantamento-terra-romeno",
};
function buildIndex(exercises: Exercise[]) {
  const byName = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const e of exercises) {
    const n = normalizeName(e.name);
    if (n && !byName.has(n)) byName.set(n, e.id);
    const k = strippedKey(e.name);
    if (k && k.length >= 4 && !byKey.has(k)) byKey.set(k, e.id);
  }
  return { byName, byKey };
}
export function matchExercise(name: string, exercises: Exercise[], aliases: Record<string, string>): string | null {
  const n = normalizeName(name);
  if (!n) return null;
  if (aliases[n]) return aliases[n];
  const staticAlias = STATIC_ALIASES[n];
  if (staticAlias) return staticAlias;
  const { byName, byKey } = buildIndex(exercises);
  if (byName.has(n)) return byName.get(n)!;
  if (byKey.has(n)) return byKey.get(n)!;
  const k = strippedKey(name);
  if (k && byKey.has(k)) return byKey.get(k)!;
  return null;
}
export function groupMatchConfidence(name: string, exercises: Exercise[], aliases: Record<string, string>): "alias" | "nome" | "chave" | null {
  const n = normalizeName(name);
  if (aliases[n]) return "alias";
  if (STATIC_ALIASES[n]) return "alias";
  const { byName, byKey } = buildIndex(exercises);
  if (byName.has(n)) return "nome";
  const k = strippedKey(name);
  if (byKey.has(n) || (k && byKey.has(k))) return "chave";
  return null;
}
