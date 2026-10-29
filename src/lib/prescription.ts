import type { Exercise, Prescription } from "./types";

export function defaultPrescription(ex: Exercise, first = false): Prescription {
  return { exerciseId: ex.id, sets: 3, repsMin: ex.joints > 1 ? 8 : 10, repsMax: ex.joints > 1 ? 12 : 15, rir: ex.joints > 1 ? 2 : 1, rest: ex.joints > 1 ? 90 : 60, role: ex.joints > 1 ? first ? "Principal" : "Acessório" : "Isolador", technique: "Tradicional" };
}
