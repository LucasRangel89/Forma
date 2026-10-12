import { buildDemo } from "../src/lib/demo";
import { buildDiarioLogs } from "../src/lib/importer";
import { matchExercise } from "../src/lib/taxonomy";
import { CATALOG } from "../src/lib/catalog";
import { fatigue, muscleVolume, weekStart } from "../src/lib/engine";
import type { AppData, Exercise, LoggedSet, WorkoutLog } from "../src/lib/types";

function probeExercise(): Exercise {
  return {
    id: "probe-ex", name: "Probe",
    primary: [{ muscle: "biceps", weight: 1 }],
    secondary: [{ muscle: "triceps-longo", weight: 1 }],
    pattern: "Flexão de cotovelo", equipment: ["Halter"], joints: 1, laterality: "Bilateral",
    roles: ["Acessório"], emphasis: ["Hipertrofia"], systemic: "Baixa", technical: "Baixa",
    level: "Iniciante", resistance: "Intermediário", restrictions: [], sfr: 4, instructions: "t",
  };
}
function probeData(logs: WorkoutLog[], date = "2026-06-11T12:00:00Z"): AppData {
  const base = buildDemo("probe", new Date("2026-06-12T12:00:00Z"));
  void date;
  return { ...base, exercises: [probeExercise()], logs };
}
function sets(n: number, rir: number | null, warmup = false): LoggedSet[] {
  return Array.from({ length: n }, () => ({ reps: 10, weight: 10, rir, completed: true, warmup }));
}
function log(id: string, date: string, s: LoggedSet[]): WorkoutLog {
  return { id, planId: null, name: "Probe", date, duration: 40, entries: [{ exerciseId: "probe-ex", sets: s }], notes: "", demo: false };
}
export function engineProbes() {
  const data = probeData([log("a", "2026-06-11T12:00:00Z", sets(10, null))]);
  const vol = muscleVolume(data.logs, data.exercises, data.settings);
  const fatDay1 = fatigue(data, new Date("2026-06-12T12:00:00Z")).biceps;
  const fatDay2 = fatigue(data, new Date("2026-06-13T12:00:00Z")).biceps;
  const warmupData = probeData([log("b", "2026-06-11T12:00:00Z", [...sets(1, null, true), ...sets(10, null)])]);
  const warmupVol = muscleVolume(warmupData.logs, warmupData.exercises, warmupData.settings);
  const rir2Data = probeData([log("c", "2026-06-11T12:00:00Z", sets(10, 2))]);
  const rir2Vol = muscleVolume(rir2Data.logs, rir2Data.exercises, rir2Data.settings);
  const now = new Date("2026-06-13T10:00:00");
  const inWeek = log("in", "2026-06-10T12:00:00Z", sets(10, null));
  const lastWeek = log("out", "2026-06-06T12:00:00Z", sets(10, null));
  const winData = probeData([inWeek, lastWeek]);
  const calVol = muscleVolume(winData.logs.filter(l => new Date(l.date).getTime() >= weekStart(now).getTime()), winData.exercises, winData.settings);
  const rollVol = muscleVolume(winData.logs, winData.exercises, winData.settings);
  const sessions = [
    { date: "2026-06-10", name: "Supino  reto c/ barra", group: "Peito", weight: 62.5, reps: [8, 8, 6] },
    { date: "2026-06-11", name: "Exercício estranho", group: "Pernas", weight: 40, reps: [10, 10] },
  ];
  const built = buildDiarioLogs(sessions, CATALOG, {}, "probeowner1234567890");
  return {
    vol: vol.biceps, secondaryVol: vol["triceps-longo"],
    fatDay1, fatDay2, warmupVol: warmupVol.biceps, rir2Vol: rir2Vol.biceps,
    calInWeek: calVol.biceps, rollingBoth: rollVol.biceps,
    matchedAlias: matchExercise("supino", CATALOG, {}),
    matchedStripped: matchExercise("Supino  reto c/ barra", CATALOG, {}),
    built,
  };
}
