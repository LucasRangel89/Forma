import { z } from "zod";
import { planSchema, prescriptionSchema } from "./validation";
import type { LoggedSet, Prescription, WorkoutPlan } from "./types";

export interface SessionEntry { prescription: Prescription; sets: LoggedSet[] }
export interface SessionDraft {
  version: 1;
  plan: WorkoutPlan;
  manual: boolean;
  free: boolean;
  sessionName: string;
  entries: SessionEntry[];
  startedDate: string;
  date: string;
  duration: number;
  notes: string;
  elapsedSeconds: number;
  savedAt: string;
}
export type DraftState = { kind: "ready"; draft: SessionDraft } | { kind: "invalid" } | { kind: "unavailable" } | null;
const KEY = "forma-session-draft-v1";

// Drafts intentionally allow partially filled or temporarily invalid numeric
// fields: validation for a finished workout happens when it is saved.
const draftSet = z.object({ reps: z.number(), weight: z.number(), rir: z.number().nullable(), completed: z.boolean(), warmup: z.boolean().optional(), rpe: z.number().nullable().optional(), failure: z.boolean().optional() });
const draftSchema = z.object({
  version: z.literal(1), plan: planSchema.extend({ exercises: z.array(prescriptionSchema).max(25) }), manual: z.boolean(),
  // Older drafts did not have free-form sessions or a separate session name.
  free: z.boolean().default(false), sessionName: z.string().max(60).optional(),
  entries: z.array(z.object({ prescription: prescriptionSchema, sets: z.array(draftSet).min(1).max(20) })).max(30),
  startedDate: z.string().max(20), date: z.string().max(20), duration: z.number(), notes: z.string().max(2000),
  elapsedSeconds: z.number().int().min(0).max(36000), savedAt: z.string().datetime(),
});

export function readSessionDraft(storage?: Storage): DraftState {
  try {
    const raw = (storage ?? window.sessionStorage).getItem(KEY);
    if (!raw) return null;
    if (raw.length > 250000) return { kind: "invalid" };
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { kind: "ready", draft: { ...parsed.data, sessionName: parsed.data.sessionName ?? parsed.data.plan.name } as SessionDraft } : { kind: "invalid" };
  } catch (error) {
    return error instanceof SyntaxError ? { kind: "invalid" } : { kind: "unavailable" };
  }
}
export function writeSessionDraft(draft: SessionDraft, storage?: Storage): boolean {
  try {
    // Do not replace a recoverable draft with a malformed one.
    if (!draftSchema.safeParse(draft).success) return false;
    (storage ?? window.sessionStorage).setItem(KEY, JSON.stringify(draft));
    return true;
  } catch { return false; }
}
export function clearSessionDraft(storage?: Storage): boolean {
  try { (storage ?? window.sessionStorage).removeItem(KEY); return true; } catch { return false; }
}
