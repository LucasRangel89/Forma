// Taxonomia canônica em 3 níveis:  porção muscular (22)  →  grupo (10)  →  grupo legado do Diário (7)
// É a única fonte de verdade: o catálogo, o motor e o importador dependem só daqui.

/** id: [rótulo, grupo, grupoLegado, classe de recuperação ('small'|'large')] */
const P = {
  peito_clavicular:         ['Peito (clavicular)',        'peito',      'Peito',   'large'],
  peito_esternal:           ['Peito (esternal)',          'peito',      'Peito',   'large'],
  peito_costal:             ['Peito (costal)',            'peito',      'Peito',   'large'],
  dorsais:                  ['Dorsais',                   'costas',     'Costas',  'large'],
  romboides:                ['Romboides',                 'costas',     'Costas',  'small'],
  trapezio_superior:        ['Trapézio superior',         'costas',     'Costas',  'small'],
  trapezio_medio_inferior:  ['Trapézio médio/inferior',   'costas',     'Costas',  'small'],
  lombar:                   ['Lombar',                    'costas',     'Costas',  'large'],
  deltoide_anterior:        ['Deltoide anterior',         'ombros',     'Ombros',  'small'],
  deltoide_lateral:         ['Deltoide lateral',          'ombros',     'Ombros',  'small'],
  deltoide_posterior:       ['Deltoide posterior',        'ombros',     'Ombros',  'small'],
  biceps:                   ['Bíceps',                    'biceps',     'Bíceps',  'small'],
  braquial:                 ['Braquial',                  'biceps',     'Bíceps',  'small'],
  antebraco:                ['Antebraço',                 'biceps',     'Bíceps',  'small'],
  triceps_cabeca_longa:     ['Tríceps (cabeça longa)',    'triceps',    'Tríceps', 'small'],
  triceps_lateral:          ['Tríceps (lateral/medial)',  'triceps',    'Tríceps', 'small'],
  quadriceps:               ['Quadríceps',                'quadriceps', 'Pernas',  'large'],
  adutores:                 ['Adutores',                  'posterior',  'Pernas',  'large'],
  posterior_coxa:           ['Posterior de coxa',         'posterior',  'Pernas',  'large'],
  gluteos:                  ['Glúteos',                   'gluteos',    'Pernas',  'large'],
  panturrilha:              ['Panturrilha',               'panturrilha','Pernas',  'small'],
  abdomen:                  ['Abdômen',                   'abdomen',    'Abdômen', 'small']
};

export const MUSCLES = Object.fromEntries(Object.entries(P).map(([id, [label, group, legacy, tauClass]]) =>
  [id, { id, label, group, legacy, tauClass }]));
export const MUSCLE_IDS = Object.keys(MUSCLES);

/** Metas semanais de séries efetivas por grupo (defaults EDITÁVEIS; heurística popular, não regra científica). */
export const GROUPS = {
  peito:       { label: 'Peito',             min: 8, target: 14, max: 22 },
  costas:      { label: 'Costas',            min: 8, target: 16, max: 25 },
  ombros:      { label: 'Ombros',            min: 8, target: 16, max: 26 },
  biceps:      { label: 'Bíceps / braço',    min: 6, target: 12, max: 22 },
  triceps:     { label: 'Tríceps',           min: 4, target: 10, max: 18 },
  quadriceps:  { label: 'Quadríceps',        min: 6, target: 12, max: 20 },
  posterior:   { label: 'Posterior / adutores', min: 4, target: 10, max: 20 },
  gluteos:     { label: 'Glúteos',           min: 4, target: 10, max: 20 },
  panturrilha: { label: 'Panturrilha',       min: 6, target: 12, max: 20 },
  abdomen:     { label: 'Abdômen',           min: 0, target: 8,  max: 16 }
};
export const GROUP_IDS = Object.keys(GROUPS);

export const LEGACY_GROUPS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen'];
export const LEGACY_ICONS = { 'Peito': '🛡️', 'Costas': '🦅', 'Pernas': '🦵', 'Ombros': '🏔️', 'Bíceps': '💪', 'Tríceps': '🔱', 'Abdômen': '🔥' };

export const groupOf = id => MUSCLES[id].group;
export const legacyOf = id => MUSCLES[id].legacy;
export const musclesOfGroup = g => MUSCLE_IDS.filter(m => MUSCLES[m].group === g);
export const musclesOfLegacy = l => MUSCLE_IDS.filter(m => MUSCLES[m].legacy === l);

/** Quando um registro do Diário NÃO foi vinculado a um exercício do catálogo, só sabemos o grupo legado.
 *  Distribuímos o estímulo de forma aproximada (aproximação assumida e documentada). */
export const LEGACY_FALLBACK = {
  'Peito':   [['peito_esternal', 1], ['peito_clavicular', 0.5], ['peito_costal', 0.3]],
  'Costas':  [['dorsais', 1], ['romboides', 0.5], ['trapezio_medio_inferior', 0.4]],
  'Pernas':  [['quadriceps', 1], ['posterior_coxa', 0.5], ['gluteos', 0.5]],
  'Ombros':  [['deltoide_lateral', 1], ['deltoide_anterior', 0.5], ['deltoide_posterior', 0.4]],
  'Bíceps':  [['biceps', 1], ['braquial', 0.5]],
  'Tríceps': [['triceps_lateral', 1], ['triceps_cabeca_longa', 0.7]],
  'Abdômen': [['abdomen', 1]]
};

// Faixas de fadiga (%) -> 5 estados dos boxes
export const FATIGUE_STATES = [
  { key: 'exhausted', label: 'Exausto',      above: 75 },
  { key: 'high',      label: 'Fadigado',     above: 50 },
  { key: 'mid',       label: 'Recuperando',  above: 25 },
  { key: 'low',       label: 'Quase pronto', above: 10 },
  { key: 'ready',     label: 'Pronto',       above: -1 }
];
export function fatigueState(pct) {
  return FATIGUE_STATES.find(s => pct > s.above);
}
