"use client";
import { Check, Trash2 } from "lucide-react";
import type { LoggedSet } from "@/lib/types";

const numeric = (value: string) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

export function SetEditor({ set, index, exerciseName, onChange, onToggleComplete, onRemove, canRemove = true }: {
  set: LoggedSet;
  index: number;
  exerciseName: string;
  onChange: (patch: Partial<LoggedSet>) => void;
  onToggleComplete: (time: number) => void;
  onRemove: () => void;
  canRemove?: boolean;
}) {
  const number = index + 1;
  return <fieldset className={`editable-set ${set.completed ? "editable-set-done" : ""}`}>
    <legend className="sr-only">Série {number} de {exerciseName}</legend>
    <div className={`set-input-row ${set.completed ? "set-done" : ""}`}>
      <span aria-hidden="true">{number}</span>
      <input type="number" aria-label={`Carga da série ${number} de ${exerciseName}`} min={0} max={1000} step="any" value={set.weight} onChange={event => onChange({ weight: numeric(event.target.value) })} />
      <input type="number" aria-label={`Repetições da série ${number} de ${exerciseName}`} min={1} max={120} value={set.reps} onChange={event => onChange({ reps: numeric(event.target.value) })} />
      <input type="number" aria-label={`RIR da série ${number} de ${exerciseName}, opcional`} min={0} max={10} step="any" value={set.rir ?? ""} placeholder="—" onChange={event => onChange({ rir: event.target.value === "" ? null : numeric(event.target.value) })} />
      <button type="button" className="set-check" aria-label={`${set.completed ? "Desmarcar" : "Concluir"} série ${number} de ${exerciseName}`} aria-pressed={set.completed} onClick={() => onToggleComplete(Date.now())}><Check size={17} /></button>
    </div>
    <div className="set-row-options">
      <label><input type="checkbox" checked={Boolean(set.warmup)} onChange={event => onChange({ warmup: event.target.checked })} />Aquecimento</label>
      <button type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Remover série ${number} de ${exerciseName}`}><Trash2 size={14} />Remover série</button>
    </div>
    {(set.rpe != null || set.failure) && <p className="set-metadata">Metadados preservados: {set.rpe != null ? `RPE ${set.rpe}` : ""}{set.rpe != null && set.failure ? " · " : ""}{set.failure ? "falha" : ""}. Os cálculos do Forma usam o RIR.</p>}
  </fieldset>;
}

export function SetTableHead() {
  return <div className="set-table-head" aria-hidden="true"><span>Série</span><span>Carga (kg)</span><span>Reps</span><span>RIR</span><span>Feito</span></div>;
}
