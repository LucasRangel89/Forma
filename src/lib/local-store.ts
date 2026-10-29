import { z } from "zod";
import { buildDemo } from "./demo";
import { buildDiarioLogs, type DiarioSession } from "./importer";
import { normalizeName } from "./taxonomy";
import { normalizeSettings, type AppData, type Exercise, type Settings, type WorkoutPlan } from "./types";
import { appDataSchema, exerciseSchema, importSchema, linkSchema, logSchema, planImportSchema, planSchema, settingsSchema } from "./validation";

// One record per browser. Every change is a single IndexedDB transaction, so a
// failed write cannot leave plans, exercises and history only partially updated.
const DATABASE = "forma-pages";
const STORE = "profile";
const KEY = "main";
const CHANNEL = "forma-pages-changes";
let databasePromise: Promise<IDBDatabase> | undefined;

type ProfileRecord = { id: string; version: number; data: AppData };
type PreparedImport = { sessions: DiarioSession[]; ids: string[] };

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Feche as outras abas do Forma e tente novamente."));
    }).catch(error => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

function initialData(): AppData {
  const data = buildDemo("local");
  // The original example name is not the identity of the person using Pages.
  data.settings.name = "Seu perfil";
  return data;
}

function readRecord(record: ProfileRecord | undefined): AppData {
  if (!record) return initialData();
  if (record.version !== 1) throw new Error("Estes dados foram criados por outra versão do Forma. Eles não foram alterados.");
  const result = appDataSchema.safeParse(record.data);
  if (!result.success) throw new Error("Não foi possível ler os dados salvos. Eles não foram substituídos; se tiver um backup, você pode restaurá-lo.");
  return result.data as AppData;
}

async function transaction(update?: (current: AppData) => AppData, replacing = false): Promise<AppData> {
  const db = await openDatabase();
  return new Promise<AppData>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.get(KEY);
    let result: AppData;
    let operationError: unknown;
    request.onsuccess = () => {
      try {
        const current = replacing ? initialData() : readRecord(request.result as ProfileRecord | undefined);
        result = update ? update(current) : current;
        if (update || !request.result) {
          // Do not write any state that cannot subsequently be read back.
          result = appDataSchema.parse(result) as AppData;
          store.put({ id: KEY, version: 1, data: result } satisfies ProfileRecord);
        }
      } catch (error) {
        operationError = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(operationError ?? tx.error ?? new Error("Não foi possível salvar neste navegador."));
    tx.onerror = () => { /* onabort provides the transaction error */ };
  });
}

export function loadLocalData(): Promise<AppData> {
  return transaction();
}

function sorted(data: AppData): AppData {
  return {
    ...data,
    exercises: [...data.exercises].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    plans: [...data.plans].sort((a, b) => a.day - b.day),
    logs: [...data.logs].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

function requireExercises(data: AppData, ids: string[]) {
  if (ids.some(id => !data.exercises.some(exercise => exercise.id === id))) {
    throw new Error("Um exercício não foi encontrado no catálogo. Confira o treino e tente novamente.");
  }
}

// Use a stable fingerprint and occurrence number, so re-importing the same
// file is idempotent without collapsing two identical rows in the original.
async function prepareImport(payload: unknown): Promise<PreparedImport> {
  const { sessions } = importSchema.parse(payload) as { sessions: DiarioSession[] };
  const occurrences = new Map<string, number>();
  const ids = await Promise.all(sessions.map(async session => {
    const canonical = JSON.stringify([session.date, session.name, session.group, session.weight, session.reps, session.technique ?? null, session.goal ?? null]);
    const occurrence = (occurrences.get(canonical) ?? 0) + 1;
    occurrences.set(canonical, occurrence);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return `diario-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}-${occurrence}`;
  }));
  return { sessions, ids };
}

function applyAction(data: AppData, action: string, payload: unknown, prepared?: PreparedImport): AppData {
  switch (action) {
    case "savePlan": {
      const plan = planSchema.parse(payload) as WorkoutPlan;
      requireExercises(data, plan.exercises.map(exercise => exercise.exerciseId));
      return { ...data, plans: [...data.plans.filter(p => p.id !== plan.id), plan] };
    }
    case "importPlan": {
      const { plan, exercises } = planImportSchema.parse(payload) as { plan: WorkoutPlan; exercises: Exercise[] };
      if (data.plans.some(existing => existing.id === plan.id)) throw new Error("Este treino já foi importado.");
      const newExercises = exercises.filter(exercise => !data.exercises.some(existing => existing.id === exercise.id));
      if (new Set(newExercises.map(exercise => exercise.id)).size !== newExercises.length) throw new Error("O arquivo contém exercícios repetidos.");
      const next = { ...data, exercises: [...data.exercises, ...newExercises], userExerciseIds: [...data.userExerciseIds, ...newExercises.map(exercise => exercise.id)] };
      requireExercises(next, plan.exercises.map(exercise => exercise.exerciseId));
      return { ...next, plans: [...data.plans, plan] };
    }
    case "saveProgram": {
      const plans = z.array(planSchema).min(1).max(6).parse(payload) as WorkoutPlan[];
      if (new Set(plans.map(plan => plan.id)).size !== plans.length || plans.some(plan => data.plans.some(p => p.id === plan.id))) {
        throw new Error("Este programa já foi adicionado ao planejamento.");
      }
      plans.forEach(plan => requireExercises(data, plan.exercises.map(exercise => exercise.exerciseId)));
      return { ...data, plans: [...data.plans, ...plans] };
    }
    case "deletePlan": {
      const id = z.string().min(1).max(100).parse(payload);
      if (!data.plans.some(plan => plan.id === id)) throw new Error("Este treino já não está no planejamento.");
      return { ...data, plans: data.plans.filter(plan => plan.id !== id) };
    }
    case "logWorkout": {
      const log = logSchema.parse(payload);
      requireExercises(data, log.entries.map(entry => entry.exerciseId));
      if (log.planId && !data.plans.some(plan => plan.id === log.planId)) throw new Error("O treino não está mais no planejamento.");
      const entries = log.entries.map(entry => ({ ...entry, sets: entry.sets.filter(set => set.completed || set.warmup).map(set => ({ ...set, warmup: set.warmup ?? false })) })).filter(entry => entry.sets.length);
      return { ...data, logs: [{ ...log, id: crypto.randomUUID(), entries, demo: false }, ...data.logs] };
    }
    case "deleteLog": {
      const id = z.string().min(1).max(100).parse(payload);
      if (!data.logs.some(log => log.id === id)) throw new Error("Este registro já foi removido.");
      return { ...data, logs: data.logs.filter(log => log.id !== id) };
    }
    case "clearDemo":
      return { ...data, logs: data.logs.filter(log => !log.demo) };
    case "saveSettings":
      return { ...data, settings: normalizeSettings(settingsSchema.parse(payload) as Settings) };
    case "checkIn": {
      const score = z.number().int().min(1).max(5).parse(payload);
      return { ...data, settings: { ...data.settings, checkIn: { score, date: new Date().toISOString() } } };
    }
    case "saveExercise": {
      const exercise = exerciseSchema.parse(payload) as Exercise;
      return { ...data, exercises: [...data.exercises.filter(ex => ex.id !== exercise.id), exercise], userExerciseIds: [...new Set([...data.userExerciseIds, exercise.id])] };
    }
    case "importDiario": {
      if (!prepared) throw new Error("Não foi possível preparar a importação.");
      const alreadyImported = new Set(data.logs.map(log => log.id));
      const indexes = prepared.ids.map((id, index) => ({ id, index })).filter(item => !alreadyImported.has(item.id));
      if (!indexes.length) return data;
      const built = buildDiarioLogs(indexes.map(item => prepared.sessions[item.index]), data.exercises, data.settings.nameAliases, "local");
      return {
        ...data,
        exercises: [...data.exercises, ...built.custom],
        userExerciseIds: [...data.userExerciseIds, ...built.custom.map(ex => ex.id)],
        logs: [...data.logs, ...built.logs.map((log, index) => ({ ...log, id: indexes[index].id }))],
      };
    }
    case "linkExercise": {
      const { exerciseId, targetId } = linkSchema.parse(payload);
      const source = data.exercises.find(ex => ex.id === exerciseId);
      const target = data.exercises.find(ex => ex.id === targetId);
      if (!source || !data.userExerciseIds.includes(exerciseId) || !target || exerciseId === targetId) throw new Error("Não foi possível vincular estes exercícios.");
      const nameAliases = Object.fromEntries(Object.entries(data.settings.nameAliases).map(([name, id]) => [name, id === exerciseId ? targetId : id]));
      nameAliases[normalizeName(source.name)] = targetId;
      return {
        ...data,
        exercises: data.exercises.filter(ex => ex.id !== exerciseId),
        userExerciseIds: data.userExerciseIds.filter(id => id !== exerciseId),
        plans: data.plans.map(plan => ({ ...plan, exercises: plan.exercises.map(ex => ex.exerciseId === exerciseId ? { ...ex, exerciseId: targetId } : ex) })),
        logs: data.logs.map(log => ({ ...log, entries: log.entries.map(entry => entry.exerciseId === exerciseId ? { ...entry, exerciseId: targetId } : entry) })),
        settings: { ...data.settings, nameAliases, favorites: [...new Set(data.settings.favorites.map(id => id === exerciseId ? targetId : id))] },
      };
    }
    case "restoreBackup": {
      const backup = z.object({ version: z.literal(1) }).passthrough().parse(payload);
      return appDataSchema.parse(backup) as AppData;
    }
    default:
      throw new Error("Ação não reconhecida.");
  }
}

export async function performLocalAction(action: string, payload: unknown): Promise<AppData> {
  const prepared = action === "importDiario" ? await prepareImport(payload) : undefined;
  const data = await transaction(current => sorted(applyAction(current, action, payload, prepared)), action === "restoreBackup");
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("updated");
    channel.close();
  }
  return data;
}

export function subscribeToLocalChanges(listener: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = listener;
  return () => channel.close();
}

export function localErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (issue?.code === "custom") return issue.message;
    return "Confira os campos preenchidos e os limites indicados. Nenhuma alteração foi salva.";
  }
  if (error instanceof Error && error.name === "QuotaExceededError") return "Não há espaço para salvar neste navegador. Exporte seus dados e libere espaço antes de tentar novamente.";
  if (error instanceof Error && ["InvalidStateError", "SecurityError", "UnknownError"].includes(error.name)) return "O armazenamento deste navegador não está disponível. Suas alterações não foram salvas.";
  return error instanceof Error && error.message ? error.message : "Não foi possível salvar neste navegador. Seus dados preenchidos continuam nesta tela.";
}
