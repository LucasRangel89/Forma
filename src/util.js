// Utilidades puras. Nenhuma função aqui lê o relógio, exceto todayLocal() (usada só pela UI).

export function todayLocal(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' -> nº inteiro de dias (diferença entre datas = subtração) */
export function dayNumber(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function addDays(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Segunda-feira da semana de `str` */
export function weekStart(str) {
  const [y, m, d] = str.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom
  return addDays(str, -((dow + 6) % 7));
}

/** minúsculas, sem acento, "c/"→"com", sem pontuação, espaços únicos */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bc\//g, 'com ')
    .replace(/\bs\//g, 'sem ')
    .replace(/[°º]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(s) { return normalize(s).replace(/ /g, '-'); }

const STOP = new Set(['com', 'de', 'da', 'do', 'na', 'no', 'em', 'a', 'o', 'e', 'para', 'p']);
export function tokens(s) {
  return normalize(s).split(' ').filter(t => t && !STOP.has(t)).map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
