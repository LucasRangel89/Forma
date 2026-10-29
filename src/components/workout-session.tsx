"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check, CheckCheck, ChevronDown, ChevronUp, Clock3, Dumbbell, Layers3, Plus, Save, Search, Timer, Trash2, X } from "lucide-react";
import { slug } from "@/lib/catalog";
import { e1rm, formatDate, formatNumber, planMinutes, planWarnings } from "@/lib/engine";
import { defaultPrescription } from "@/lib/prescription";
import { exerciseSessions, progressionHint } from "@/lib/progress";
import { clearSessionDraft, readSessionDraft, writeSessionDraft, type DraftState, type SessionDraft, type SessionEntry } from "@/lib/session-draft";
import type { AppData, LoggedSet, Prescription, WorkoutPlan } from "@/lib/types";
import { SetEditor, SetTableHead } from "./set-editor";
import { type Action, Badge, Button, Modal, useBeforeUnloadWarning } from "./ui";

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const fmtClock = (ms: number) => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; };
function makeEntry(prescription: Prescription, data: AppData): SessionEntry {
  const previous = exerciseSessions(data.logs, prescription.exerciseId)[0]?.sets ?? [];
  return {
    prescription: { ...prescription },
    sets: Array.from({ length: prescription.sets }, (_, index) => ({ reps: prescription.repsMin, weight: previous[index]?.weight ?? previous[0]?.weight ?? 0, rir: null, completed: false, warmup: prescription.role === "Aquecimento" })),
  };
}

export function WorkoutSession({ plan, data, manual = false, free = false, draft, action, onDraftChange, onClose }: {
  plan: WorkoutPlan; data: AppData; manual?: boolean; free?: boolean; draft?: SessionDraft; action: Action;
  onDraftChange: (state: DraftState) => void; onClose: () => void;
}) {
  const [entries, setEntries] = useState<SessionEntry[]>(() => draft ? structuredClone(draft.entries) : plan.exercises.map(prescription => makeEntry(prescription, data)));
  const [initialEntries] = useState(() => JSON.stringify(entries));
  const [startedDate] = useState(() => draft?.startedDate ?? localDate());
  const [open, setOpen] = useState(entries.length ? 0 : -1);
  const [seconds, setSeconds] = useState(draft?.elapsedSeconds ?? 0);
  const [sessionName, setSessionName] = useState(draft?.sessionName ?? plan.name);
  const [duration, setDuration] = useState(draft?.duration ?? (free ? 0 : planMinutes(plan)));
  const [date, setDate] = useState(draft?.date ?? startedDate);
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState<"pending" | "saved" | "failed">("pending");
  const [restEnd, setRestEnd] = useState(0), [restTotal, setRestTotal] = useState(0), [tick, setTick] = useState(0);
  const [showCalc, setShowCalc] = useState(false), [calcW, setCalcW] = useState(60), [calcR, setCalcR] = useState(8);
  const [picker, setPicker] = useState(free && entries.length === 0), [search, setSearch] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Effects may still have a pending timer after a successful save/close.
  // Gate every writer before removing the draft so it cannot be resurrected.
  const draftClosed = useRef(false);
  const wasChanged = useRef(false);
  const changed = Boolean(draft) || sessionName !== plan.name || JSON.stringify(entries) !== initialEntries || Boolean(notes.trim()) || (manual && (date !== startedDate || duration !== (free ? 0 : planMinutes(plan))));
  useBeforeUnloadWarning(changed);
  useEffect(() => {
    if (manual) return;
    const start = Date.now(), elapsed = draft?.elapsedSeconds ?? 0;
    const timer = setInterval(() => setSeconds(Math.min(36000, elapsed + Math.floor((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [manual, draft]);
  useEffect(() => {
    if (!restEnd) return;
    const timer = setInterval(() => { const now = Date.now(); setTick(now); if (now >= restEnd) clearInterval(timer); }, 500);
    return () => clearInterval(timer);
  }, [restEnd]);
  const makeDraft = useCallback((): SessionDraft => ({ version: 1, plan, manual, free, sessionName, entries, startedDate, date, duration, notes, elapsedSeconds: seconds, savedAt: new Date().toISOString() }), [plan, manual, free, sessionName, entries, startedDate, date, duration, notes, seconds]);
  useEffect(() => {
    if (!changed) {
      // If every edit was undone, an older auto-save must not be offered on reload.
      if (!wasChanged.current || draftClosed.current) return;
      wasChanged.current = false;
      const cleared = clearSessionDraft();
      const timer = setTimeout(() => { if (!draftClosed.current) setDraftStatus(cleared ? "pending" : "failed"); }, 0);
      return () => clearTimeout(timer);
    }
    wasChanged.current = true;
    const saveOnExit = () => { if (!draftClosed.current) writeSessionDraft(makeDraft()); };
    const timer = setTimeout(() => {
      if (!draftClosed.current) setDraftStatus(writeSessionDraft(makeDraft()) ? "saved" : "failed");
    }, 200);
    window.addEventListener("pagehide", saveOnExit);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", saveOnExit); };
  }, [changed, makeDraft]);
  const selectedId = entries[open]?.prescription.exerciseId;
  const history = useMemo(() => selectedId ? exerciseSessions(data.logs, selectedId) : [], [data.logs, selectedId]);
  const warningPlan = useMemo(() => ({ ...plan, exercises: entries.map(entry => ({ ...entry.prescription, sets: entry.sets.filter(set => !set.warmup).length })) }), [plan, entries]);
  const warnings = useMemo(() => planWarnings(warningPlan, data), [warningPlan, data]);
  const completed = entries.reduce((count, entry) => count + entry.sets.filter(set => set.completed).length, 0);
  const total = entries.reduce((count, entry) => count + entry.sets.length, 0);
  const planExists = !free && data.plans.some(item => item.id === plan.id);
  const options = data.exercises.filter(exercise => slug(exercise.name).includes(slug(search))).slice(0, 20);
  const showError = (message: string) => { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); };
  function update(i: number, j: number, patch: Partial<LoggedSet>) {
    setEntries(current => current.map((entry, ei) => ei === i ? { ...entry, sets: entry.sets.map((set, si) => si === j ? { ...set, ...patch } : set) } : entry));
    setError("");
  }
  function checkSet(i: number, j: number, value: boolean, now: number) {
    update(i, j, { completed: value });
    const rest = entries[i].prescription.rest;
    if (!manual && value && rest > 0) { setTick(now); setRestTotal(rest * 1000); setRestEnd(now + rest * 1000); }
  }
  const close = () => {
    if (saving || (changed && !confirm("Sair e descartar este rascunho? Para continuar depois, use Guardar rascunho."))) return;
    draftClosed.current = true;
    const cleared = clearSessionDraft();
    onDraftChange(cleared ? null : readSessionDraft());
    onClose();
  };
  function keepDraft() {
    const next = makeDraft();
    if (!writeSessionDraft(next)) { setDraftStatus("failed"); showError("Não foi possível guardar o rascunho nesta aba. Mantenha esta tela aberta ou finalize o treino."); return; }
    draftClosed.current = true;
    onDraftChange({ kind: "ready", draft: next });
    onClose();
  }
  async function finish() {
    if (saving) return;
    setError("");
    const local = new Date(`${date}T18:00:00`);
    const normalized = Number.isFinite(local.getTime()) ? `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}` : "";
    if (!sessionName.trim() || sessionName.length > 60) { showError("Informe um nome para esta sessão (até 60 caracteres)."); return; }
    if (!date || date > localDate() || normalized !== date) { showError("Escolha uma data válida, até o dia de hoje."); return; }
    if (manual && (!Number.isInteger(duration) || duration < 0 || duration > 600)) { showError("Informe uma duração entre 0 e 600 minutos."); return; }
    if (!completed) { showError("Marque pelo menos uma série como concluída antes de salvar."); return; }
    const completedEntries = entries.map(entry => ({ exerciseId: entry.prescription.exerciseId, sets: entry.sets.filter(set => set.completed) })).filter(entry => entry.sets.length);
    for (const entry of completedEntries) {
      if (!data.exercises.some(exercise => exercise.id === entry.exerciseId)) {
        setOpen(entries.findIndex(item => item.prescription.exerciseId === entry.exerciseId));
        showError("Um exercício do rascunho não está mais no catálogo. Escolha o exercício correspondente antes de salvar.");
        return;
      }
      const invalid = entry.sets.some(set => !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 120 || !Number.isFinite(set.weight) || set.weight < 0 || set.weight > 1000 || (set.rir !== null && (!Number.isFinite(set.rir) || set.rir < 0 || set.rir > 10)));
      if (invalid) {
        setOpen(entries.findIndex(item => item.prescription.exerciseId === entry.exerciseId));
        showError(`Confira carga (0–1000 kg), repetições (1–120) e RIR (0–10) das séries de ${data.exercises.find(ex => ex.id === entry.exerciseId)?.name ?? "este exercício"}.`);
        return;
      }
    }
    setSaving(true);
    const timestamp = date === localDate() ? new Date() : local;
    if (await action("logWorkout", { planId: planExists ? plan.id : null, name: sessionName.trim(), date: timestamp.toISOString(), duration: manual ? duration : Math.round(seconds / 60), entries: completedEntries, notes }, "Treino registrado! Seu volume, sua fadiga e seu rank foram atualizados.")) {
      draftClosed.current = true;
      const cleared = clearSessionDraft();
      onDraftChange(cleared ? null : readSessionDraft());
      onClose();
    }
    setSaving(false);
  }
  return <Modal wide title={plan.name} eyebrow={manual ? "MODO ACADEMIA · REGISTRAR" : "MODO ACADEMIA · SEU MOMENTO"} onClose={close} footer={<><div className="session-footer-summary"><strong>{completed} de {total}</strong><span>séries concluídas</span></div><div className="session-footer-actions"><Button variant="secondary" disabled={saving} onClick={keepDraft}><Save size={15} />Guardar rascunho</Button><Button onClick={finish} loading={saving}><CheckCheck size={16} />Finalizar e salvar</Button></div></>}>
    <fieldset className="session-editable" disabled={saving}><legend className="sr-only">Registro da sessão</legend>
      <div className="session-summary"><span><Dumbbell size={16} />{entries.length} exercícios</span><span><Layers3 size={16} />{total} séries</span><span className="session-timer"><Clock3 size={17} />{manual ? `${duration} min` : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}</span>{restEnd > tick && <span className="rest-pill" title={`Descanso de ${Math.round(restTotal / 1000)} segundos`}><Timer size={13} />{fmtClock(restEnd - tick)}<button type="button" aria-label="Cancelar descanso" onClick={() => setRestEnd(0)}><X size={11} /></button></span>}</div>
      <div className="session-progress-track"><i style={{ width: `${completed / Math.max(total, 1) * 100}%` }} /></div>
      {manual && <div className="form-grid compact-form">{free && <label className="field">Nome da sessão<input value={sessionName} maxLength={60} onChange={event => setSessionName(event.target.value)} /></label>}<label className="field">Data do treino<input type="date" value={date} max={localDate()} onChange={event => setDate(event.target.value)} required /></label><label className="field">Duração (minutos)<input type="number" value={duration} min={0} max={600} onChange={event => setDuration(Number(event.target.value))} /></label></div>}
      {warnings.length > 0 && <details className="warning-details"><summary>{warnings.length} ponto(s) de atenção para esta sessão <ChevronDown size={13} /></summary>{warnings.map((warning, index) => <p key={index}>{warning}</p>)}<small>São avisos, não bloqueios. Ajuste conforme sua percepção.{data.logs.some(log => log.demo) ? " A recuperação ainda considera sessões de exemplo; remova-as em Configurações se quiser indicadores apenas pessoais." : ""}</small></details>}
      {free ? <p className="draft-status">Sessão avulsa: ela não cria nem altera um plano de treino.</p> : !planExists && <p className="draft-status draft-status-error">O plano foi removido. Esta sessão será registrada sem vínculo com um planejamento.</p>}
      {entries.some(entry => !data.exercises.some(exercise => exercise.id === entry.prescription.exerciseId)) && <p className="draft-status draft-status-error">Um exercício desta sessão não está mais no catálogo. Abra o bloco e escolha o correspondente; as séries serão preservadas.</p>}
      <p className="session-instruction">A carga anterior vem apenas de registros reais: confira antes de cada série. RIR é opcional e começa vazio; 0 kg indica peso corporal. Aquecimentos concluídos não entram no volume de trabalho.</p>
      <p className={`draft-status ${draftStatus === "failed" ? "draft-status-error" : ""}`} role="status">{draftStatus === "failed" ? "Rascunho automático indisponível. Mantenha esta tela aberta até salvar." : draftStatus === "saved" ? "Alterações guardadas nesta aba: podem ser retomadas após recarregar, mas não após fechá-la e não entram no backup." : "Após a primeira alteração, um rascunho é guardado nesta aba quando possível. Ele não entra no backup e não sobrevive ao fechamento da aba."}</p>
      <div className="session-exercises">{entries.map((entry, i) => {
        const pr = entry.prescription, ex = data.exercises.find(exercise => exercise.id === pr.exerciseId), exerciseName = ex?.name ?? pr.exerciseId;
        const duplicate = entries.filter(item => item.prescription.exerciseId === pr.exerciseId).length > 1;
        const accessibleName = duplicate ? `${exerciseName} (bloco ${i + 1})` : exerciseName;
        const done = entry.sets.filter(set => set.completed).length;
        const last = open === i ? history[0] : undefined;
        const hint = open === i && !free ? progressionHint(history, plan.id, pr, duplicate) : null;
        const compared = open === i && !free ? history.find(session => session.log.planId === plan.id) : undefined;
        return <div className={`session-exercise ${done === entry.sets.length ? "exercise-done" : ""}`} key={`${pr.exerciseId}-${i}`}>
          <button type="button" id={`session-exercise-heading-${i}`} className="session-exercise-heading" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span className="session-exercise-index">{done === entry.sets.length ? <Check size={16} /> : String(i + 1).padStart(2, "0")}</span><div><strong>{exerciseName}</strong><span>Referência: {pr.sets} × {pr.repsMin}–{pr.repsMax} · {pr.rir} RIR · {pr.rest}s de descanso</span></div><small>{done}/{entry.sets.length}</small>{open === i ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
          {open === i && <div className="session-exercise-body">
            {!ex && <label className="field missing-exercise">Escolha o exercício correspondente para {exerciseName}<select value="" onChange={event => { const exerciseId = event.target.value; if (exerciseId) { setEntries(current => current.map((item, index) => index === i ? { ...item, prescription: { ...item.prescription, exerciseId } } : item)); requestAnimationFrame(() => document.getElementById(`session-exercise-heading-${i}`)?.focus()); } }}><option value="">Selecione no catálogo</option>{data.exercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><small>A troca vale apenas para esta sessão e mantém as séries preenchidas.</small></label>}
            <div className="session-context">{last ? <span title="Última sessão real"><Dumbbell size={12} />Última sessão real em {formatDate(last.log.date)}: {last.sets.map(set => `${formatNumber(set.weight, 3)} kg × ${set.reps}`).join(" · ")}</span> : <span>Sem sessões reais anteriores para este exercício</span>}{ex?.goal ? <span>Meta registrada: {formatNumber(ex.goal, 3)} kg</span> : null}</div>
            {hint && <p className={`progression-hint ${hint.kind === "ready" ? "progression-ready" : ""}`}><strong>Dupla progressão · prescrição atual</strong>{compared && <span>Última sessão deste plano: {formatDate(compared.log.date)}. </span>}{hint.text}</p>}
            <SetTableHead />{entry.sets.map((set, j) => <SetEditor key={j} set={set} index={j} exerciseName={accessibleName} canRemove={entry.sets.length > 1} onChange={patch => update(i, j, patch)} onToggleComplete={now => checkSet(i, j, !set.completed, now)} onRemove={() => {
              if (set.completed && !confirm(`Remover a série concluída ${j + 1} de ${exerciseName}?`)) return;
              setEntries(current => current.map((item, index) => index === i ? { ...item, sets: item.sets.filter((_, setIndex) => setIndex !== j) } : item));
              requestAnimationFrame(() => document.getElementById(`session-add-set-${i}`)?.focus());
            }} />)}
            <div className="set-actions"><Badge color="gray">{pr.role}</Badge><div className="set-actions-buttons"><button type="button" id={`session-add-set-${i}`} disabled={entry.sets.length >= 20} onClick={() => { const lastSet = entry.sets.at(-1); setEntries(current => current.map((item, index) => index === i ? { ...item, sets: [...item.sets, { reps: lastSet?.reps ?? pr.repsMin, weight: lastSet?.weight ?? 0, rir: null, completed: false, warmup: false }] } : item)); }}><Plus size={15} />Adicionar série</button><button type="button" onClick={() => { const lastWeight = [...entry.sets].reverse().find(set => set.weight > 0)?.weight; if (lastWeight != null) setEntries(current => current.map((item, index) => index === i ? { ...item, sets: item.sets.map(set => set.completed ? set : { ...set, weight: lastWeight }) } : item)); }}><Dumbbell size={14} />Repetir carga</button><button type="button" onClick={() => { setEntries(current => current.map((item, index) => index === i ? { ...item, sets: item.sets.map(set => ({ ...set, completed: true })) } : item)); setError(""); if (i + 1 < entries.length) setOpen(i + 1); }}><CheckCheck size={15} />Concluir séries deste exercício</button></div></div>
            <button type="button" className="remove-session-exercise" onClick={() => { if (!confirm(`Remover ${exerciseName} desta sessão? O planejamento não será alterado.`)) return; setEntries(current => current.filter((_, index) => index !== i)); setOpen(-1); requestAnimationFrame(() => document.getElementById("session-add-exercise")?.focus()); }}><Trash2 size={15} />Remover exercício desta sessão</button>
          </div>}
        </div>;
      })}</div>
      <Button id="session-add-exercise" variant="secondary" className="add-exercise-button" disabled={entries.length >= 30} onClick={() => setPicker(value => !value)}><Plus size={16} />{picker ? "Fechar catálogo" : "Adicionar exercício à sessão"}</Button>
      {picker && <div className="exercise-picker"><label className="search-field"><Search size={16} /><span className="sr-only">Buscar exercício para a sessão</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar no catálogo..." /></label><div>{options.map(ex => <button type="button" key={ex.id} disabled={entries.some(entry => entry.prescription.exerciseId === ex.id)} onClick={() => { setEntries(current => [...current, makeEntry(defaultPrescription(ex, !current.length), data)]); setOpen(entries.length); setPicker(false); setSearch(""); requestAnimationFrame(() => document.getElementById(`session-exercise-heading-${entries.length}`)?.focus()); }}><span><strong>{ex.name}</strong><small>{ex.equipment.join(" · ")}</small></span><Plus size={16} /></button>)}{!options.length && <p className="inline-empty">Nenhum exercício encontrado.</p>}</div></div>}
      <p className="session-instruction">Adicionar ou remover séries e exercícios muda apenas esta sessão, não o plano salvo.</p>
      {showCalc ? <div className="session-calculators"><div className="calc-grid"><div className="calc-inputs"><label>Carga (kg)<input type="number" min={0} value={calcW} onChange={event => setCalcW(Number(event.target.value))} aria-label="Carga para a calculadora" /></label><label>Repetições<input type="number" min={1} max={60} value={calcR} onChange={event => setCalcR(Number(event.target.value))} aria-label="Repetições para a calculadora" /></label></div><div className="calc-result"><p>e1RM estimado (Epley): <strong>{formatNumber(e1rm(calcW, calcR), 1)} kg</strong></p><p>Aquecimento sugerido para {formatNumber(calcW, 1)} kg:</p><div className="calc-chips">{[[50, 10], [60, 8], [70, 6], [80, 4], [90, 2]].map(([pct, reps]) => <span key={pct}>{formatNumber(Math.max(2.5, Math.round(calcW * pct / 100 / 2.5) * 2.5), 1)} kg × {reps}</span>)}</div></div></div></div> : <button type="button" className="calc-toggle" onClick={() => setShowCalc(true)}><Calculator size={15} />Calculadoras · 1RM e aquecimento</button>}
      <label className="field session-notes">Como foi o treino?<textarea rows={2} maxLength={2000} placeholder="Sensações, ajustes, conquistas... (opcional)" value={notes} onChange={event => setNotes(event.target.value)} /></label>
      {error && <p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
    </fieldset>
  </Modal>;
}
