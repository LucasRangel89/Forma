import type { WorkoutLog } from "./types";
import { storedLogSchema } from "./validation";

// Zod puts known properties in a consistent order, including optional set
// metadata. Comparing the full snapshot prevents an editor in one tab from
// silently replacing a newer edit (or an exercise link) made in another.
export function sameWorkoutLog(a: WorkoutLog, b: WorkoutLog): boolean {
  return JSON.stringify(storedLogSchema.parse(a)) === JSON.stringify(storedLogSchema.parse(b));
}
