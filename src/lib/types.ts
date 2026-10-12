export type Muscle =
  | "peito-clavicular" | "peito-esternal" | "dorsais" | "trapezio-superior" | "trapezio-medio" | "trapezio-inferior"
  | "deltoide-anterior" | "deltoide-lateral" | "deltoide-posterior" | "biceps" | "braquial"
  | "triceps-longo" | "triceps-lateral" | "quadriceps" | "posterior" | "gluteos" | "adutores"
  | "panturrilha" | "abdomen" | "lombar" | "antebraco";
export type Demand = "Baixa" | "Média" | "Alta";
export type Role = "Principal" | "Acessório" | "Isolador" | "Finalizador" | "Aquecimento" | "Ativação" | "Mobilidade";
export type Equipment = "Barra" | "Halter" | "Máquina" | "Polia" | "Peso corporal" | "Kettlebell" | "Elástico" | "Smith" | "Banco";
export type Level = "Iniciante" | "Intermediário" | "Avançado";
export interface MuscleWeight { muscle: Muscle; weight: number }
export interface Exercise {
  id: string;
  name: string;
  primary: MuscleWeight[];
  secondary: MuscleWeight[];
  pattern: string;
  equipment: Equipment[];
  joints: number;
  laterality: "Bilateral" | "Unilateral";
  roles: Role[];
  emphasis: string[];
  systemic: Demand;
  technical: Demand;
  level: Level;
  resistance: "Alongado" | "Intermediário" | "Encurtado";
  restrictions: string[];
  sfr: number;
  instructions: string;
  goal?: number;
}
export interface Prescription {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  rir: number;
  rest: number;
  role: Role;
  technique: "Tradicional" | "Drop-set" | "Rest-pause" | "Cluster";
}
export interface WorkoutPlan {
  id: string;
  name: string;
  subtitle: string;
  type: "Upper" | "Lower" | "Full body" | "Personalizado";
  day: number;
  exercises: Prescription[];
}
export interface LoggedSet { reps: number; weight: number; rir: number | null; completed: boolean; warmup?: boolean; rpe?: number | null; failure?: boolean }
export interface LoggedExercise { exerciseId: string; sets: LoggedSet[] }
export interface WorkoutLog {
  id: string;
  planId: string | null;
  name: string;
  date: string;
  duration: number;
  entries: LoggedExercise[];
  notes: string;
  demo: boolean;
}
export interface CheckIn { score: number; date: string }
export interface FatigueScale { quasePronto: number; recuperando: number; fadigado: number; exausto: number }
export interface RirFactors { falha: number; rir1: number; rir3: number; acima: number }
export interface Gamification { enabled: boolean }
export type Appearance = "forma" | "noite";
export interface Settings {
  name: string;
  goal: "Hipertrofia" | "Força" | "Condicionamento";
  level: Level;
  days: number;
  sessionMinutes: number;
  equipment: Equipment[];
  restrictions: string[];
  priorities: Muscle[];
  indirectWeight: number;
  sessionCap: number;
  smallTau: number;
  largeTau: number;
  fatigueScale: FatigueScale;
  rirFactors: RirFactors;
  targets: Record<string, number>;
  favorites: string[];
  checkIn: CheckIn | null;
  nameAliases: Record<string, string>;
  gamification: Gamification;
  appearance: Appearance;
}
export interface AppData { exercises: Exercise[]; plans: WorkoutPlan[]; logs: WorkoutLog[]; settings: Settings; userExerciseIds: string[] }
export type View = "overview" | "workouts" | "exercises" | "journal" | "progress" | "assistant" | "settings";
export interface MuscleGroup { id: string; label: string; muscles: Muscle[]; min: number; target: number; max: number; color: string }
export const MUSCLE_LABELS: Record<Muscle, string> = {
  "peito-clavicular": "Peitoral superior", "peito-esternal": "Peitoral esternal", dorsais: "Dorsais",
  "trapezio-superior": "Trapézio superior", "trapezio-medio": "Trapézio médio", "trapezio-inferior": "Trapézio inferior",
  "deltoide-anterior": "Deltoide anterior", "deltoide-lateral": "Deltoide lateral", "deltoide-posterior": "Deltoide posterior",
  biceps: "Bíceps", braquial: "Braquial", "triceps-longo": "Tríceps · cabeça longa", "triceps-lateral": "Tríceps · cabeça lateral",
  quadriceps: "Quadríceps", posterior: "Posterior de coxa", gluteos: "Glúteos", adutores: "Adutores", panturrilha: "Panturrilha",
  abdomen: "Abdômen", lombar: "Lombar", antebraco: "Antebraço",
};
export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: "peito", label: "Peito", muscles: ["peito-clavicular", "peito-esternal"], min: 8, target: 14, max: 22, color: "#739583" },
  { id: "costas", label: "Costas", muscles: ["dorsais", "trapezio-medio", "trapezio-inferior"], min: 8, target: 16, max: 25, color: "#739583" },
  { id: "ombros", label: "Ombros", muscles: ["deltoide-anterior", "deltoide-lateral", "deltoide-posterior"], min: 8, target: 16, max: 26, color: "#93aa9b" },
  { id: "biceps", label: "Bíceps", muscles: ["biceps", "braquial"], min: 6, target: 12, max: 22, color: "#93aa9b" },
  { id: "triceps", label: "Tríceps", muscles: ["triceps-longo", "triceps-lateral"], min: 4, target: 12, max: 18, color: "#aabcaf" },
  { id: "quadriceps", label: "Quadríceps", muscles: ["quadriceps"], min: 6, target: 12, max: 20, color: "#aabcaf" },
  { id: "posterior", label: "Posterior", muscles: ["posterior"], min: 4, target: 10, max: 20, color: "#b9c9bc" },
  { id: "gluteos", label: "Glúteos", muscles: ["gluteos"], min: 6, target: 12, max: 22, color: "#b9c9bc" },
  { id: "panturrilha", label: "Panturrilha", muscles: ["panturrilha"], min: 6, target: 12, max: 20, color: "#c7d2c8" },
  { id: "abdomen", label: "Abdômen", muscles: ["abdomen"], min: 4, target: 10, max: 16, color: "#c7d2c8" },
];
export const COARSE_GROUPS: { id: string; label: string; muscles: Muscle[] }[] = [
  { id: "peito", label: "Peito", muscles: ["peito-clavicular", "peito-esternal"] },
  { id: "costas", label: "Costas", muscles: ["dorsais", "trapezio-medio", "trapezio-inferior"] },
  { id: "ombros", label: "Ombros", muscles: ["deltoide-anterior", "deltoide-lateral", "deltoide-posterior"] },
  { id: "biceps", label: "Bíceps", muscles: ["biceps", "braquial"] },
  { id: "triceps", label: "Tríceps", muscles: ["triceps-longo", "triceps-lateral"] },
  { id: "pernas", label: "Pernas", muscles: ["quadriceps", "posterior", "gluteos", "panturrilha"] },
  { id: "abdomen", label: "Abdômen", muscles: ["abdomen", "lombar"] },
];
export const COARSE_FALLBACK: Record<string, MuscleWeight[]> = {
  Peito: [{ muscle: "peito-esternal", weight: 1 }],
  Costas: [{ muscle: "dorsais", weight: 1 }],
  Ombros: [{ muscle: "deltoide-anterior", weight: 0.5 }, { muscle: "deltoide-lateral", weight: 0.5 }],
  "Bíceps": [{ muscle: "biceps", weight: 1 }],
  "Tríceps": [{ muscle: "triceps-longo", weight: 1 }],
  Pernas: [{ muscle: "quadriceps", weight: 0.6 }, { muscle: "posterior", weight: 0.4 }],
  "Abdômen": [{ muscle: "abdomen", weight: 1 }],
};
export const COARSE_PATTERN: Record<string, string> = {
  Peito: "Empurrar horizontal", Costas: "Puxar horizontal", Ombros: "Empurrar vertical",
  "Bíceps": "Flexão de cotovelo", "Tríceps": "Extensão de cotovelo", Pernas: "Agachar", "Abdômen": "Rotação / anti-rotação",
};
export const COARSE_LABELS = COARSE_GROUPS.map(g => g.label) as [string, ...string[]];
export const EQUIPMENT: Equipment[] = ["Barra", "Halter", "Máquina", "Polia", "Peso corporal", "Kettlebell", "Elástico", "Smith", "Banco"];
export const ROLES: Role[] = ["Principal", "Acessório", "Isolador", "Finalizador", "Aquecimento", "Ativação", "Mobilidade"];
export const PATTERNS = ["Empurrar horizontal", "Empurrar vertical", "Puxar horizontal", "Puxar vertical", "Agachar", "Dobradiça de quadril", "Avanço / unilateral", "Flexão de cotovelo", "Extensão de cotovelo", "Elevação", "Rotação / anti-rotação", "Carregar", "Flexão plantar", "Mobilidade"];
export const DEFAULT_SETTINGS: Settings = {
  name: "Lucas Costa", goal: "Hipertrofia", level: "Intermediário", days: 4, sessionMinutes: 60,
  equipment: [...EQUIPMENT], restrictions: [], priorities: ["peito-clavicular", "deltoide-lateral"],
  indirectWeight: 0.5, sessionCap: 10, smallTau: 1.5, largeTau: 2,
  fatigueScale: { quasePronto: 15, recuperando: 35, fadigado: 60, exausto: 80 },
  rirFactors: { falha: 1.25, rir1: 1.1, rir3: 1, acima: 0.65 },
  targets: Object.fromEntries(MUSCLE_GROUPS.map(g => [g.id, g.target])), favorites: [], checkIn: null,
  nameAliases: {}, gamification: { enabled: true }, appearance: "forma",
};
export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    ...d, ...(s ?? {}),
    equipment: s?.equipment ?? [...d.equipment],
    restrictions: s?.restrictions ?? [],
    priorities: s?.priorities ?? [],
    favorites: s?.favorites ?? [],
    nameAliases: s?.nameAliases ?? {},
    targets: { ...d.targets, ...(s?.targets ?? {}) },
    fatigueScale: { ...d.fatigueScale, ...(s?.fatigueScale ?? {}) },
    rirFactors: { ...d.rirFactors, ...(s?.rirFactors ?? {}) },
    gamification: { ...d.gamification, ...(s?.gamification ?? {}) },
    appearance: s?.appearance ?? d.appearance,
  } as Settings;
}
