"use client";
import { useRef, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { slug } from "@/lib/catalog";
import type { AppData, LoggedExercise, LoggedSet, WorkoutLog } from "@/lib/types";
import { logChangesSchema } from "@/lib/validation";
import { SetEditor, SetTableHead } from "./set-editor";
import { type Action, Button, Modal, useBeforeUnloadWarning } from "./ui";

function localDateTime(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LogEditor({ log, data, action, onCancel, onSaved }: { log: WorkoutLog; data: AppData; action: Action; onCancel: () => void; onSaved: () => void }) {
  const [expected] = useState(() => structuredClone(log));
  const [name, setName] = useState(log.name);
  const [date, setDate] = useState(() => localDateTime(log.date));
  const [duration, setDuration] = useState(log.duration);
  const [notes, setNotes] = useState(log.notes);
  const [entries, setEntries] = useState<LoggedExercise[]>(() => structuredClone(log.entries));
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const changed = name !== expected.name || date !== localDateTime(expected.date) || duration !== expected.duration || notes !== expected.notes || JSON.stringify(entries) !== JSON.stringify(expected.entries);
  useBeforeUnloadWarning(changed);
  const showError = (message: string) => { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); };
  const close = () => { if (!saving && (!changed || confirm("Descartar as alterações deste registro?"))) onCancel(); };
  const options = data.exercises.filter(exercise => slug(exercise.name).includes(slug(search))).slice(0, 20);
  const update = (i: number, j: number, patch: Partial<LoggedSet>) => {
    setEntries(current => current.map((entry, ei) => ei === i ? { ...entry, sets: entry.sets.map((set, si) => si === j ? { ...set, ...patch } : set) } : entry));
    setError("");
  };
  async function save() {
    if (saving) return;
    const parsed = new Date(date);
    if (!date || !Number.isFinite(parsed.getTime()) || localDateTime(parsed.toISOString()) !== date) { showError("Informe uma data e hora válidas."); return; }
    // Preserve original seconds and timezone instant if the date field was not touched.
    const timestamp = date === localDateTime(expected.date) ? expected.date : parsed.toISOString();
    const changes = { name, date: timestamp, duration, entries, notes };
    const checked = logChangesSchema.safeParse(changes);
    if (!checked.success) {
      const message = checked.error.issues.find(issue => issue.code === "custom")?.message ?? "Confira nome, data, duração (0–600 min), carga (0–1000 kg), repetições (1–120) e RIR (0–10).";
      showError(message);
      return;
    }
    setError(""); setSaving(true);
    if (await action("updateLog", { expected, changes: checked.data }, "Registro atualizado. Volume e recuperação foram recalculados.")) onSaved();
    setSaving(false);
  }
  return <Modal wide title="Corrigir registro" eyebrow="DIÁRIO · EDIÇÃO" onClose={close} footer={<><span className="muted small">O planejamento original não será alterado.</span><Button onClick={save} loading={saving}><Save size={16} />Salvar correções</Button></>}>
    <fieldset className="session-editable" disabled={saving}><legend className="sr-only">Correção da sessão</legend>
    <p className="modal-intro">Corrija o que aconteceu na sessão. As alterações não mudam o treino planejado. {log.demo ? "Este registro continuará identificado como exemplo." : ""}</p>
    <div className="form-grid compact-form">
      <label className="field">Nome do registro<input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="field">Data e hora<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field">Duração (minutos)<input type="number" min={0} max={600} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
    </div>
    <p className="session-instruction">Aquecimentos não contam para o volume de trabalho. Carga 0 indica peso corporal. Ao adicionar uma série, a última carga e reps são copiadas; o RIR começa vazio.</p>
    <div className="session-exercises log-edit-exercises">{entries.map((entry, i) => {
      const exerciseName = data.exercises.find(ex => ex.id === entry.exerciseId)?.name ?? entry.exerciseId;
      const accessibleName = entries.filter(item => item.exerciseId === entry.exerciseId).length > 1 ? `${exerciseName} (bloco ${i + 1})` : exerciseName;
      return <section className="session-exercise" key={`${entry.exerciseId}-${i}`}>
        <div className="log-edit-heading"><h3 tabIndex={-1} id={`log-edit-heading-${i}`}>{exerciseName}</h3><button type="button" onClick={() => {
          if (confirm(`Remover ${exerciseName} deste registro?`)) { setEntries(current => current.filter((_, index) => index !== i)); requestAnimationFrame(() => document.getElementById("log-add-exercise")?.focus()); }
        }}><Trash2 size={15} />Remover exercício</button></div>
        <div className="session-exercise-body"><SetTableHead />{entry.sets.map((set, j) => <SetEditor key={j} set={set} index={j} exerciseName={accessibleName} canRemove={entry.sets.length > 1}
          onChange={patch => update(i, j, patch)} onToggleComplete={() => update(i, j, { completed: !set.completed })}
          onRemove={() => { if (confirm(`Remover a série ${j + 1} de ${exerciseName} deste registro?`)) { setEntries(current => current.map((item, index) => index === i ? { ...item, sets: item.sets.filter((_, setIndex) => setIndex !== j) } : item)); requestAnimationFrame(() => document.getElementById(`log-add-set-${i}`)?.focus()); } }} />)}
          <div className="set-actions"><button type="button" id={`log-add-set-${i}`} disabled={entry.sets.length >= 20} onClick={() => {
            const last = entry.sets.at(-1);
            setEntries(current => current.map((item, index) => index === i ? { ...item, sets: [...item.sets, { reps: last?.reps ?? 1, weight: last?.weight ?? 0, rir: null, completed: true, warmup: false }] } : item));
          }}><Plus size={15} />Adicionar série</button><small>Até 20 séries por exercício</small></div>
        </div>
      </section>;
    })}</div>
    <Button id="log-add-exercise" variant="secondary" className="add-exercise-button" disabled={entries.length >= 30} onClick={() => setPicker(value => !value)}><Plus size={16} />{picker ? "Fechar catálogo" : "Adicionar exercício ao registro"}</Button>
    {picker && <div className="exercise-picker"><label className="search-field"><Search size={16} /><span className="sr-only">Buscar exercício para o registro</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar no catálogo..." /></label><div>{options.map(ex => <button key={ex.id} disabled={entries.some(entry => entry.exerciseId === ex.id)} onClick={() => { setEntries(current => [...current, { exerciseId: ex.id, sets: [{ reps: 1, weight: 0, rir: null, completed: true, warmup: false }] }]); setPicker(false); setSearch(""); requestAnimationFrame(() => document.getElementById(`log-edit-heading-${entries.length}`)?.focus()); }}><span><strong>{ex.name}</strong><small>{ex.equipment.join(" · ")}</small></span><Plus size={16} /></button>)}{!options.length && <p className="inline-empty">Nenhum exercício encontrado.</p>}</div></div>}
    <label className="field session-notes">Notas da sessão<textarea rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    {error && <p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
    </fieldset>
  </Modal>;
}
