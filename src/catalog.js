// Catálogo gerado por FAMÍLIAS: cada família define a assinatura muscular; cada variação só sobrescreve o que muda.
// "Composto/isolador" NÃO é tag manual: deriva do nº de articulações (joints > 1).
import { slugify, normalize, tokens } from './util.js';
import { MUSCLES, legacyOf, groupOf } from './taxonomy.js';

const mkMuscles = (prim = [], sec = []) => [
  ...prim.map(([m, w]) => ({ m, w, role: 'primary' })),
  ...sec.map(([m, w]) => ({ m, w, role: 'secondary' }))
];

const BASE = {
  joints: 2, roles: ['principal', 'acessorio'], emphasis: ['hipertrofia'], sys: 'media', tech: 'media',
  level: 'intermediario', resist: 'meio', restr: [], sfr: 3, lat: 'bilateral', alias: [], notes: ''
};

const out = [];
function fam(defaults, rows) {
  for (const [name, equipment, o = {}] of rows) {
    const d = { ...BASE, ...defaults, ...o };
    out.push({
      id: slugify(name), name, aliases: d.alias, pattern: d.pattern, joints: d.joints,
      mechanic: d.joints > 1 ? 'composto' : 'isolador',
      equipment, laterality: d.lat, roles: d.roles, emphasis: d.emphasis,
      systemic: d.sys, technical: d.tech, level: d.level, resistance: d.resist,
      restrictions: d.restr, sfr: d.sfr, notes: d.notes,
      muscles: mkMuscles(d.prim, d.sec)
    });
  }
}

// ---------- PEITO ----------
const FLAT = { prim: [['peito_esternal', 1], ['peito_clavicular', .5], ['peito_costal', .3]], sec: [['deltoide_anterior', .6], ['triceps_lateral', .6], ['triceps_cabeca_longa', .3]] };
const INCL = { prim: [['peito_clavicular', 1], ['peito_esternal', .6]], sec: [['deltoide_anterior', .8], ['triceps_lateral', .5], ['triceps_cabeca_longa', .3]] };
const DECL = { prim: [['peito_costal', 1], ['peito_esternal', .7]], sec: [['triceps_lateral', .6], ['triceps_cabeca_longa', .3], ['deltoide_anterior', .3]] };
const PUSH_H = { pattern: 'empurrar_horizontal', emphasis: ['hipertrofia', 'forca'], restr: ['ombro'] };
fam({ ...PUSH_H, ...FLAT }, [
  ['Supino Reto com Barra', ['barra', 'banco'], { tech: 'alta', alias: ['supino', 'supino reto', 'bench press'] }],
  ['Supino Reto com Halteres', ['halter', 'banco'], { resist: 'alongado', sfr: 4, restr: [] }],
  ['Supino Reto na Máquina', ['maquina'], { level: 'iniciante', tech: 'baixa', sfr: 4, restr: [], sys: 'baixa' }],
  ['Supino Reto no Smith', ['smith', 'banco'], { tech: 'baixa' }]
]);
fam({ ...PUSH_H, ...INCL }, [
  ['Supino Inclinado com Barra', ['barra', 'banco'], { tech: 'alta', alias: ['supino inclinado'] }],
  ['Supino Inclinado com Halteres', ['halter', 'banco'], { resist: 'alongado', sfr: 4, restr: [] }],
  ['Supino Inclinado na Máquina', ['maquina'], { level: 'iniciante', tech: 'baixa', sfr: 4, restr: [], sys: 'baixa' }],
  ['Supino Inclinado no Smith', ['smith', 'banco'], { tech: 'baixa' }]
]);
fam({ ...PUSH_H, ...DECL }, [
  ['Supino Declinado com Barra', ['barra', 'banco'], { tech: 'alta' }],
  ['Supino Declinado com Halteres', ['halter', 'banco'], { sfr: 3, restr: [] }]
]);
fam({ ...PUSH_H, ...FLAT, roles: ['acessorio', 'finalizador'] }, [
  ['Flexão de Braço', ['peso_corporal'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 3, restr: ['punho'], alias: ['flexao'] }],
  ['Paralelas (Peito)', ['peso_corporal', 'paralelas'], { prim: DECL.prim, tech: 'alta', sfr: 4, resist: 'alongado', alias: ['paralelas', 'mergulho nas paralelas', 'dips'] }]
]);
const FLY = { pattern: 'empurrar_horizontal', joints: 1, roles: ['isolador', 'finalizador'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4, restr: [],
  prim: FLAT.prim, sec: [['deltoide_anterior', .3]] };
fam(FLY, [
  ['Crucifixo Reto com Halteres', ['halter', 'banco'], { resist: 'alongado', restr: ['ombro'], alias: ['crucifixo com halteres', 'crucifixo', 'fly'] }],
  ['Crucifixo Inclinado com Halteres', ['halter', 'banco'], { prim: INCL.prim, resist: 'alongado', restr: ['ombro'] }],
  ['Crossover Polia Alta', ['polia'], { prim: DECL.prim, resist: 'encurtado', alias: ['crossover', 'crossover na polia', 'cross over'] }],
  ['Crossover Polia Baixa', ['polia'], { prim: INCL.prim, resist: 'encurtado' }],
  ['Peck Deck', ['maquina'], { level: 'iniciante', sfr: 5, resist: 'meio', alias: ['voador', 'peck deck fly'] }],
  ['Crucifixo na Polia no Banco', ['polia', 'banco'], { resist: 'alongado', sfr: 5 }]
]);

// ---------- COSTAS ----------
const ROW = { pattern: 'puxar_horizontal', emphasis: ['hipertrofia', 'forca'],
  prim: [['dorsais', 1], ['trapezio_medio_inferior', .6], ['romboides', .5]], sec: [['biceps', .6], ['deltoide_posterior', .5], ['braquial', .4], ['lombar', .3]] };
fam(ROW, [
  ['Remada Curvada com Barra', ['barra'], { tech: 'alta', sys: 'alta', restr: ['lombar'], alias: ['remada curvada', 'remada'] }],
  ['Remada Curvada Supinada', ['barra'], { tech: 'alta', sys: 'alta', restr: ['lombar'], sec: [['biceps', .8], ['deltoide_posterior', .3], ['braquial', .4]] }],
  ['Remada Unilateral com Halter (Serrote)', ['halter', 'banco'], { lat: 'unilateral', sfr: 4, resist: 'alongado', alias: ['remada unilateral', 'serrote', 'remada serrote'] }],
  ['Remada Cavalinho (T-Bar)', ['barra'], { sys: 'media', sfr: 4, alias: ['remada cavalinho', 't-bar', 'remada t bar'] }],
  ['Remada Baixa na Polia', ['polia'], { level: 'iniciante', tech: 'baixa', sfr: 4, sys: 'baixa', alias: ['remada baixa', 'remada sentada', 'remada sentada na polia'] }],
  ['Remada Articulada na Máquina', ['maquina'], { level: 'iniciante', tech: 'baixa', sfr: 5, sys: 'baixa', alias: ['remada maquina'] }],
  ['Remada com Peito Apoiado', ['halter', 'banco'], { sfr: 5, sys: 'baixa', restr: [], alias: ['remada apoiada'] }],
  ['Remada no Smith', ['smith'], { tech: 'baixa', restr: ['lombar'] }],
  ['Remada Alta Pegada Aberta na Polia', ['polia'], { prim: [['trapezio_medio_inferior', 1], ['romboides', .8], ['deltoide_posterior', .6], ['dorsais', .5]], sec: [['biceps', .4]], sfr: 4, sys: 'baixa' }],
  ['Remada Invertida', ['peso_corporal', 'barra'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 3 }]
]);
const PULL_V = { pattern: 'puxar_vertical', emphasis: ['hipertrofia', 'forca'],
  prim: [['dorsais', 1], ['trapezio_medio_inferior', .4]], sec: [['biceps', .7], ['braquial', .5], ['deltoide_posterior', .3]] };
fam(PULL_V, [
  ['Barra Fixa Pronada', ['peso_corporal', 'barra_fixa'], { tech: 'alta', sys: 'media', sfr: 4, resist: 'alongado', alias: ['barra fixa', 'pull up'] }],
  ['Barra Fixa Supinada (Chin-up)', ['peso_corporal', 'barra_fixa'], { tech: 'alta', sfr: 4, sec: [['biceps', 1], ['braquial', .6]], alias: ['chin up', 'chin-up'] }],
  ['Puxada Frontal Pegada Aberta', ['polia'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 4, resist: 'alongado', alias: ['puxada frontal', 'puxada', 'puxada alta', 'pulldown'] }],
  ['Puxada Pegada Triângulo', ['polia'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 4, alias: ['puxada triangulo'] }],
  ['Puxada Supinada', ['polia'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 4, sec: [['biceps', 1], ['braquial', .6]] }],
  ['Puxada Unilateral na Polia', ['polia'], { lat: 'unilateral', tech: 'baixa', sys: 'baixa', sfr: 5, resist: 'alongado' }],
  ['Barra Fixa Assistida na Máquina', ['maquina'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 3 }],
  ['Pullover na Polia', ['polia'], { pattern: 'puxar_vertical', joints: 1, roles: ['isolador', 'finalizador'], prim: [['dorsais', 1]], sec: [['peito_costal', .2]], tech: 'baixa', sys: 'baixa', sfr: 5, resist: 'alongado', emphasis: ['hipertrofia', 'estetica'], alias: ['pullover'] }]
]);

// ---------- OMBROS / TRAPÉZIO ----------
const OHP = { pattern: 'empurrar_vertical', emphasis: ['hipertrofia', 'forca'], restr: ['ombro'],
  prim: [['deltoide_anterior', 1], ['deltoide_lateral', .6]], sec: [['triceps_lateral', .6], ['triceps_cabeca_longa', .3], ['trapezio_superior', .4], ['peito_clavicular', .3]] };
fam(OHP, [
  ['Desenvolvimento Militar com Barra', ['barra'], { tech: 'alta', sys: 'media', alias: ['desenvolvimento militar', 'desenvolvimento', 'military press'] }],
  ['Desenvolvimento com Halteres', ['halter', 'banco'], { sfr: 4, restr: [], alias: ['desenvolvimento c halteres'] }],
  ['Desenvolvimento na Máquina', ['maquina'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', sfr: 4, restr: [] }],
  ['Arnold Press', ['halter', 'banco'], { tech: 'media', sfr: 4, restr: [], prim: [['deltoide_anterior', 1], ['deltoide_lateral', .8]] }],
  ['Desenvolvimento no Smith', ['smith', 'banco'], { tech: 'baixa' }]
]);
const LAT = { pattern: 'elevacao', joints: 1, roles: ['isolador', 'finalizador'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 5,
  prim: [['deltoide_lateral', 1]], sec: [['trapezio_superior', .2]] };
fam(LAT, [
  ['Elevação Lateral com Halteres', ['halter'], { alias: ['elevacao lateral'], resist: 'encurtado' }],
  ['Elevação Lateral na Polia', ['polia'], { lat: 'unilateral', resist: 'alongado' }],
  ['Elevação Lateral na Máquina', ['maquina'], { level: 'iniciante', resist: 'meio' }],
  ['Elevação Lateral Inclinada', ['halter', 'banco'], { resist: 'alongado' }],
  ['Elevação Lateral Sentado', ['halter', 'banco'], { resist: 'meio' }],
  ['Elevação Frontal com Halteres', ['halter'], { prim: [['deltoide_anterior', 1]], sec: [['peito_clavicular', .2]], sfr: 3, alias: ['elevacao frontal'] }]
]);
const REAR = { pattern: 'elevacao', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica', 'postura'], tech: 'baixa', sys: 'baixa', sfr: 5,
  prim: [['deltoide_posterior', 1]], sec: [['romboides', .4], ['trapezio_medio_inferior', .4]] };
fam(REAR, [
  ['Crucifixo Inverso com Halteres', ['halter', 'banco'], { alias: ['crucifixo inverso'] }],
  ['Crucifixo Inverso na Máquina', ['maquina'], { level: 'iniciante', alias: ['peck deck inverso'] }],
  ['Crucifixo Inverso na Polia', ['polia'], { lat: 'unilateral' }],
  ['Face Pull', ['polia', 'corda'], { joints: 2, roles: ['acessorio', 'ativacao', 'finalizador'], emphasis: ['postura', 'hipertrofia'], sfr: 5, alias: ['facepull'] }]
]);
fam({ pattern: 'puxar_vertical', prim: [['deltoide_lateral', .8], ['trapezio_superior', 1]], sec: [['deltoide_posterior', .4], ['biceps', .3]], roles: ['acessorio'], sfr: 3, restr: ['ombro'] }, [
  ['Remada Alta com Barra', ['barra'], { alias: ['remada alta'] }]
]);
const TRAP = { pattern: 'puxar_vertical', joints: 1, roles: ['isolador', 'acessorio'], tech: 'baixa', sys: 'baixa', sfr: 4, prim: [['trapezio_superior', 1]], sec: [['antebraco', .3]] };
fam(TRAP, [
  ['Encolhimento com Barra', ['barra'], { alias: ['encolhimento', 'shrug'] }],
  ['Encolhimento com Halteres', ['halter']]
]);

// ---------- BÍCEPS ----------
const CURL = { pattern: 'flexao_cotovelo', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4,
  prim: [['biceps', 1], ['braquial', .5]], sec: [['antebraco', .4]] };
fam(CURL, [
  ['Rosca Direta com Barra', ['barra'], { alias: ['rosca direta', 'rosca'] }],
  ['Rosca Direta com Barra W', ['barra_w']],
  ['Rosca Alternada com Halteres', ['halter'], { alias: ['rosca alternada'] }],
  ['Rosca Martelo com Halteres', ['halter'], { prim: [['braquial', 1], ['biceps', .6], ['antebraco', .6]], sec: [], alias: ['rosca martelo', 'martelo'] }],
  ['Rosca Inclinada', ['halter', 'banco'], { resist: 'alongado', sfr: 5 }],
  ['Rosca Scott', ['barra_w', 'banco_scott'], { resist: 'alongado', sfr: 5, alias: ['rosca scott com barra', 'scott'] }],
  ['Rosca Concentrada', ['halter'], { lat: 'unilateral', resist: 'encurtado', sfr: 4 }],
  ['Rosca na Polia', ['polia'], { resist: 'encurtado', sfr: 4, alias: ['rosca na polia baixa', 'rosca cabo'] }],
  ['Rosca Spider', ['halter', 'banco'], { resist: 'encurtado', sfr: 4 }],
  ['Rosca Inversa', ['barra_w'], { prim: [['antebraco', 1], ['braquial', .8]], sec: [['biceps', .4]], sfr: 3 }]
]);

// ---------- TRÍCEPS ----------
const TRI = { pattern: 'extensao_cotovelo', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4,
  prim: [['triceps_lateral', 1], ['triceps_cabeca_longa', .7]], sec: [] };
fam(TRI, [
  ['Tríceps Pulley com Barra', ['polia'], { alias: ['triceps polia alta', 'triceps pulley', 'triceps polia', 'pulley'] }],
  ['Tríceps Corda', ['polia', 'corda'], { sfr: 4, alias: ['triceps corda na polia'] }],
  ['Tríceps Testa com Barra W', ['barra_w', 'banco'], { prim: [['triceps_cabeca_longa', 1], ['triceps_lateral', .8]], resist: 'alongado', sfr: 5, restr: ['punho'], alias: ['triceps testa', 'skull crusher'] }],
  ['Tríceps Testa com Halteres', ['halter', 'banco'], { prim: [['triceps_cabeca_longa', 1], ['triceps_lateral', .8]], resist: 'alongado', sfr: 4 }],
  ['Tríceps Francês com Halter', ['halter'], { prim: [['triceps_cabeca_longa', 1], ['triceps_lateral', .6]], resist: 'alongado', sfr: 5, alias: ['triceps frances', 'frances'] }],
  ['Tríceps Francês na Polia', ['polia', 'corda'], { prim: [['triceps_cabeca_longa', 1], ['triceps_lateral', .6]], resist: 'alongado', sfr: 5 }],
  ['Tríceps Coice', ['halter'], { resist: 'encurtado', sfr: 3 }]
]);
fam({ pattern: 'extensao_cotovelo', joints: 2, roles: ['acessorio', 'finalizador'], emphasis: ['hipertrofia'], sfr: 3, prim: [['triceps_lateral', 1], ['triceps_cabeca_longa', .8]], sec: [['peito_costal', .4], ['deltoide_anterior', .4]] }, [
  ['Mergulho no Banco', ['peso_corporal', 'banco'], { level: 'iniciante', tech: 'baixa', sys: 'baixa', restr: ['ombro', 'punho'], alias: ['mergulho', 'triceps banco'] }],
  ['Mergulho nas Paralelas (Tríceps)', ['peso_corporal', 'paralelas'], { tech: 'alta', sfr: 4, restr: ['ombro'] }],
  ['Supino Fechado com Barra', ['barra', 'banco'], { pattern: 'empurrar_horizontal', roles: ['principal', 'acessorio'], tech: 'media', sfr: 3, restr: ['punho', 'ombro'], emphasis: ['hipertrofia', 'forca'], alias: ['supino fechado', 'supino pegada fechada'], prim: [['triceps_lateral', 1], ['triceps_cabeca_longa', .7]], sec: [['peito_esternal', .6], ['deltoide_anterior', .4]] }]
]);

// ---------- QUADRÍCEPS / AGACHAR ----------
const SQ = { pattern: 'agachar', emphasis: ['hipertrofia', 'forca'], sys: 'alta', tech: 'alta', restr: ['joelho', 'lombar'],
  prim: [['quadriceps', 1], ['gluteos', .6]], sec: [['adutores', .5], ['posterior_coxa', .3], ['lombar', .3], ['abdomen', .3]] };
fam(SQ, [
  ['Agachamento Livre', ['barra', 'rack'], { alias: ['agachamento', 'squat', 'agachamento com barra'] }],
  ['Agachamento Frontal', ['barra', 'rack'], { prim: [['quadriceps', 1], ['gluteos', .4]], sec: [['abdomen', .4], ['lombar', .3]] }],
  ['Agachamento no Smith', ['smith'], { tech: 'baixa', sys: 'media', sfr: 4, alias: ['agachamento smith'] }],
  ['Agachamento Goblet', ['halter', 'kettlebell'], { level: 'iniciante', tech: 'baixa', sys: 'media', sfr: 3, emphasis: ['hipertrofia'] }],
  ['Agachamento Hack', ['maquina'], { tech: 'baixa', sys: 'media', sfr: 5, restr: ['joelho'], alias: ['hack squat', 'hack'] }],
  ['Leg Press 45°', ['maquina'], { tech: 'baixa', sys: 'media', sfr: 5, restr: ['joelho'], alias: ['leg press', 'leg 45'] }],
  ['Leg Press Horizontal', ['maquina'], { tech: 'baixa', sys: 'media', sfr: 4, restr: ['joelho'] }],
  ['Agachamento Búlgaro', ['halter', 'banco'], { lat: 'unilateral', sys: 'media', sfr: 4, resist: 'alongado', alias: ['bulgaro', 'agachamento bulgaro'] }],
  ['Afundo com Halteres', ['halter'], { lat: 'unilateral', sys: 'media', sfr: 4, tech: 'media', alias: ['afundo', 'lunge'] }],
  ['Avanço Caminhando', ['halter'], { lat: 'unilateral', sys: 'media', sfr: 3, tech: 'media', alias: ['avanco', 'passada'] }],
  ['Step-up', ['halter', 'banco'], { lat: 'unilateral', sys: 'baixa', sfr: 4, tech: 'baixa', restr: ['joelho'], alias: ['step up'] }]
]);
fam({ pattern: 'extensao_joelho', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 5, restr: ['joelho'],
  prim: [['quadriceps', 1]], sec: [] }, [
  ['Cadeira Extensora', ['maquina'], { alias: ['extensora'] }],
  ['Cadeira Extensora Unilateral', ['maquina'], { lat: 'unilateral' }]
]);

// ---------- POSTERIOR / GLÚTEOS / LOMBAR ----------
const HINGE = { pattern: 'dobradica_quadril', emphasis: ['hipertrofia', 'forca'], sys: 'alta', tech: 'alta', restr: ['lombar'],
  prim: [['posterior_coxa', 1], ['gluteos', .8]], sec: [['lombar', .6], ['trapezio_superior', .3], ['antebraco', .3], ['adutores', .3]] };
fam(HINGE, [
  ['Levantamento Terra Convencional', ['barra'], { sfr: 3, prim: [['gluteos', 1], ['posterior_coxa', .9], ['quadriceps', .5]], sec: [['lombar', .8], ['trapezio_superior', .5], ['dorsais', .4], ['antebraco', .4]], alias: ['levantamento terra', 'terra', 'deadlift'] }],
  ['Levantamento Terra Sumô', ['barra'], { sfr: 3, prim: [['gluteos', 1], ['adutores', .8], ['quadriceps', .6], ['posterior_coxa', .6]], sec: [['lombar', .6], ['antebraco', .4]] }],
  ['Levantamento Terra Romeno', ['barra'], { sfr: 4, resist: 'alongado', alias: ['terra romeno', 'romeno', 'rdl'] }],
  ['Levantamento Terra Romeno com Halteres', ['halter'], { sfr: 4, sys: 'media', tech: 'media', resist: 'alongado' }],
  ['Stiff com Barra', ['barra'], { sfr: 4, resist: 'alongado', sys: 'media', alias: ['stiff'] }],
  ['Bom Dia', ['barra'], { sfr: 3, tech: 'alta', level: 'avancado' }]
]);
fam({ pattern: 'dobradica_quadril', roles: ['principal', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], sys: 'media', tech: 'baixa', sfr: 5, restr: [],
  prim: [['gluteos', 1], ['posterior_coxa', .5]], sec: [['adutores', .4], ['quadriceps', .3]] }, [
  ['Hip Thrust com Barra', ['barra', 'banco'], { tech: 'media', resist: 'encurtado', alias: ['elevacao pelvica', 'hip thrust', 'hipthrust'] }],
  ['Hip Thrust na Máquina', ['maquina'], { level: 'iniciante', resist: 'encurtado' }],
  ['Ponte de Glúteo', ['peso_corporal'], { level: 'iniciante', sys: 'baixa', sfr: 3, roles: ['acessorio', 'ativacao'], alias: ['glute bridge', 'ponte'] }],
  ['Elevação Pélvica Unilateral', ['peso_corporal', 'banco'], { lat: 'unilateral', sys: 'baixa', sfr: 4 }]
]);
fam({ pattern: 'flexao_joelho', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 5,
  prim: [['posterior_coxa', 1]], sec: [['panturrilha', .2]] }, [
  ['Mesa Flexora', ['maquina'], { resist: 'meio', alias: ['flexora deitada', 'flexora'] }],
  ['Cadeira Flexora', ['maquina'], { resist: 'alongado', sfr: 5 }],
  ['Nordic Curl', ['peso_corporal'], { level: 'avancado', tech: 'alta', sfr: 3, roles: ['acessorio'] }]
]);
fam({ pattern: 'abducao_quadril', joints: 1, roles: ['isolador', 'acessorio', 'ativacao'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4,
  prim: [['gluteos', 1]], sec: [] }, [
  ['Cadeira Abdutora', ['maquina'], { alias: ['abdutora', 'abducao'] }],
  ['Chute de Glúteo na Polia', ['polia'], { lat: 'unilateral', alias: ['kickback', 'glute kickback'] }],
  ['Cadeira Adutora', ['maquina'], { prim: [['adutores', 1]], sfr: 3, alias: ['adutora'] }]
]);
fam({ pattern: 'dobradica_quadril', joints: 1, roles: ['acessorio', 'isolador'], tech: 'baixa', sys: 'baixa', sfr: 3, restr: ['lombar'],
  prim: [['lombar', 1]], sec: [['gluteos', .4], ['posterior_coxa', .4]] }, [
  ['Extensão Lombar no Banco 45°', ['banco_45'], { alias: ['extensao lombar', 'hiperextensao'] }]
]);

// ---------- PANTURRILHA ----------
fam({ pattern: 'flexao_plantar', joints: 1, roles: ['isolador', 'acessorio'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4, prim: [['panturrilha', 1]], sec: [] }, [
  ['Panturrilha em Pé na Máquina', ['maquina'], { resist: 'alongado', alias: ['panturrilha em pe', 'panturrilha', 'gemeos'] }],
  ['Panturrilha Sentado', ['maquina'], { resist: 'encurtado', alias: ['panturrilha sentado na maquina', 'soleo'] }],
  ['Panturrilha no Leg Press', ['maquina'], {}],
  ['Panturrilha Unilateral no Degrau', ['peso_corporal'], { lat: 'unilateral', resist: 'alongado' }],
  ['Panturrilha Burro', ['maquina'], { resist: 'alongado' }]
]);

// ---------- ABDÔMEN ----------
fam({ pattern: 'flexao_tronco', joints: 1, roles: ['isolador', 'acessorio', 'finalizador'], emphasis: ['hipertrofia', 'estetica'], tech: 'baixa', sys: 'baixa', sfr: 4,
  prim: [['abdomen', 1]], sec: [] }, [
  ['Abdominal Supra', ['peso_corporal'], { level: 'iniciante', sfr: 3, alias: ['abdominal', 'crunch'] }],
  ['Abdominal Infra', ['peso_corporal'], { level: 'iniciante', sfr: 3, alias: ['infra'] }],
  ['Abdominal na Polia', ['polia', 'corda'], { sfr: 5, alias: ['crunch na polia', 'abdominal polia'] }],
  ['Abdominal na Máquina', ['maquina'], { level: 'iniciante', sfr: 4 }],
  ['Elevação de Pernas', ['peso_corporal', 'barra_fixa'], { tech: 'media', sfr: 4, alias: ['elevacao de pernas na barra', 'elevacao de pernas suspenso'] }],
  ['Roda Abdominal', ['roda'], { tech: 'alta', level: 'avancado', joints: 2, sfr: 4, alias: ['ab wheel', 'rollout'] }],
  ['Prancha', ['peso_corporal'], { pattern: 'anti_extensao', level: 'iniciante', sfr: 3, notes: '"Repetições" = segundos de sustentação.', alias: ['prancha isometrica', 'plank'] }],
  ['Pallof Press', ['polia'], { pattern: 'anti_rotacao', sfr: 4, roles: ['acessorio', 'ativacao'] }],
  ['Dead Bug', ['peso_corporal'], { pattern: 'anti_extensao', level: 'iniciante', roles: ['ativacao', 'acessorio'], sfr: 3 }]
]);
fam({ pattern: 'carregar', joints: 3, roles: ['acessorio', 'finalizador'], emphasis: ['condicionamento', 'hipertrofia'], sys: 'media', sfr: 3,
  prim: [['antebraco', 1], ['trapezio_superior', .7]], sec: [['abdomen', .5], ['gluteos', .4]] }, [
  ['Farmer\'s Walk', ['halter'], { alias: ['farmers walk', 'caminhada do fazendeiro'], notes: '"Repetições" = metros ou segundos.' }]
]);

// ---------- PREHAB / MOBILIDADE / ATIVAÇÃO ----------
fam({ pattern: 'mobilidade', joints: 1, roles: ['mobilidade', 'ativacao', 'aquecimento'], emphasis: ['postura', 'correcao'], tech: 'baixa', sys: 'baixa', level: 'iniciante', sfr: 2, prim: [], sec: [] }, [
  ['Rotação Externa com Elástico', ['elastico'], { prim: [['deltoide_posterior', .5]], alias: ['rotacao externa'] }],
  ['Band Pull-Apart', ['elastico'], { prim: [['deltoide_posterior', .6], ['trapezio_medio_inferior', .6], ['romboides', .5]], alias: ['band pull apart'] }],
  ['Clamshell', ['elastico'], { prim: [['gluteos', .6]], lat: 'unilateral' }],
  ['Y-T-W', ['peso_corporal'], { prim: [['trapezio_medio_inferior', .8], ['deltoide_posterior', .5]], alias: ['ytw'] }],
  ['Wall Slide', ['peso_corporal'], { prim: [['trapezio_medio_inferior', .5]] }],
  ['Mobilidade de Quadril 90/90', ['peso_corporal'], {}],
  ['Cat-Cow', ['peso_corporal'], {}],
  ['World\'s Greatest Stretch', ['peso_corporal'], { alias: ['worlds greatest stretch'] }]
]);

export const CATALOG = out;

// ---------- índice e busca ----------
export function buildCatalogIndex(list = CATALOG) {
  const byId = new Map(), byName = new Map(), byAlias = new Map();
  for (const ex of list) {
    byId.set(ex.id, ex);
    byName.set(normalize(ex.name), ex);
    for (const a of ex.aliases || []) if (!byAlias.has(normalize(a))) byAlias.set(normalize(a), ex);
  }
  return { list, byId, byName, byAlias };
}

/** Grupo legado dominante de um exercício (pelo primeiro músculo primário). */
export function legacyGroupOfExercise(ex) {
  const p = ex.muscles.find(x => x.role === 'primary');
  return p ? legacyOf(p.m) : null;
}
export function primaryGroupOfExercise(ex) {
  const p = ex.muscles.find(x => x.role === 'primary');
  return p ? groupOf(p.m) : null;
}

/** Valida integridade do catálogo (usado nos testes e ao importar exercícios do usuário). */
export function validateExercise(ex) {
  const errs = [];
  if (!ex.id || !ex.name) errs.push('id/nome ausente');
  const seen = new Set();
  for (const mu of ex.muscles || []) {
    if (!MUSCLES[mu.m]) errs.push(`músculo inválido: ${mu.m}`);
    if (!(mu.w > 0 && mu.w <= 1)) errs.push(`peso inválido em ${mu.m}`);
    if (seen.has(mu.m)) errs.push(`músculo duplicado: ${mu.m}`);
    seen.add(mu.m);
  }
  return errs;
}

export { tokens };
