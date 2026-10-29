"use client";
import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "@/lib/engine";
import { strengthHistory } from "@/lib/progress";
import type { AppData, WorkoutLog } from "@/lib/types";
import { Badge, EmptyState, InfoNote, SectionHeading } from "./ui";

export function StrengthProgress({ data, now, onLog }: { data: AppData; now: Date; onLog: (log: WorkoutLog) => void }) {
  const [exerciseId, setExerciseId] = useState("");
  const [period, setPeriod] = useState("all");
  const [includeExamples, setIncludeExamples] = useState(false);
  const end = now.getTime(), start = period === "all" ? undefined : end - Number(period) * 86400000;
  const visibleLogs = useMemo(() => data.logs.filter(log => {
    const time = new Date(log.date).getTime();
    return Number.isFinite(time) && time <= end && (start == null || time >= start) && (includeExamples || !log.demo);
  }), [data.logs, end, start, includeExamples]);
  const exerciseIds = useMemo(() => new Set(visibleLogs.flatMap(log => log.entries.filter(entry => entry.sets.some(set => set.completed && !set.warmup)).map(entry => entry.exerciseId))), [visibleLogs]);
  const loggedExercises = data.exercises.filter(exercise => exerciseIds.has(exercise.id));
  const activeId = loggedExercises.some(exercise => exercise.id === exerciseId) ? exerciseId : loggedExercises[0]?.id ?? "";
  const activeName = loggedExercises.find(exercise => exercise.id === activeId)?.name ?? "";
  const history = strengthHistory(visibleLogs, activeId, { includeExamples: true, until: end });
  const latest = history.at(-1), previous = history.at(-2);
  const record = history.reduce<typeof latest>((best, item) => !best || item.estimate > best.estimate ? item : best, undefined);
  const change = latest && previous ? latest.estimate - previous.estimate : null;
  const chart = history.slice(-30);
  const table = history.slice(-10).reverse();
  return <section className="card strength-card"><SectionHeading title="Sua força ao longo do tempo" subtitle="Estimativa de e1RM (Epley) pela melhor série de trabalho de cada sessão." />
    <div className="strength-filters">
      <label className="field">Exercício<select className="standalone-select" aria-label="Exercício para acompanhar força" value={activeId} onChange={event => setExerciseId(event.target.value)}>{loggedExercises.length ? loggedExercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>) : <option value="">Nenhum exercício no período</option>}</select></label>
      <label className="field">Período<select className="standalone-select" aria-label="Período da evolução de força" value={period} onChange={event => { setExerciseId(activeId); setPeriod(event.target.value); }}><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="all">Todo o histórico</option></select></label>
      <label className="checkbox-label"><input type="checkbox" checked={includeExamples} onChange={event => { setExerciseId(activeId); setIncludeExamples(event.target.checked); }} />Incluir exemplos</label>
    </div>
    {latest && record ? <>
      <div className="strength-stats">
        <div><span>ÚLTIMA ESTIMATIVA</span><strong>{formatNumber(latest.estimate, 1)} <small>kg</small></strong><small>{formatDate(latest.log.date, { day: "2-digit", month: "short", year: "numeric" })}{latest.log.demo ? " · exemplo" : ""}</small></div>
        <div><span>MELHOR NO PERÍODO</span><strong>{formatNumber(record.estimate, 1)} <small>kg</small></strong><small>{formatDate(record.log.date, { day: "2-digit", month: "short", year: "numeric" })}{record.log.demo ? " · exemplo" : ""}</small></div>
        <div><span>VS. SESSÃO ANTERIOR</span><strong>{change == null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${formatNumber(Math.abs(change), 1)}`} <small>{change == null ? "" : "kg"}</small></strong><small>{change == null ? "Precisa de duas sessões" : "Diferença entre estimativas"}</small></div>
      </div>
      {chart.length > 1 ? <div className="strength-graph"><svg viewBox="0 0 800 200" role="img" aria-label={`Estimativas de ${activeName} nas últimas ${chart.length} sessões. Os valores exatos estão na tabela abaixo.`}>
        <defs><linearGradient id="strength-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a9c1ae" stopOpacity=".45" /><stop offset="100%" stopColor="#a9c1ae" stopOpacity="0" /></linearGradient></defs>
        {[20, 65, 110, 155].map(y => <line x1="20" x2="780" y1={y} y2={y} stroke="#b4c5b3" strokeDasharray="4 5" key={y} />)}
        {(() => { const max = Math.max(...chart.map(point => point.estimate), 1) * 1.15; const points = chart.map((point, index) => `${chart.length === 1 ? 400 : 30 + index * 740 / (chart.length - 1)},${180 - point.estimate / max * 160}`); return <>{points.length > 1 && <><polygon points={`30,190 ${points.join(" ")} 770,190`} fill="url(#strength-fill)" /><polyline points={points.join(" ")} fill="none" stroke="#668a73" strokeWidth="3" /></>}{points.map((point, index) => <circle key={index} cx={point.split(",")[0]} cy={point.split(",")[1]} r="5" fill="#668a73" stroke="white" strokeWidth="3" />)}</>; })()}
      </svg></div> : <p className="strength-first-point">Mais uma sessão com carga externa permitirá visualizar a tendência.</p>}
      <div className="strength-history-heading"><h3>Histórico de sessões</h3><span>{history.length > 10 ? `Últimas 10 de ${history.length}` : `${history.length} sessão(ões)`}{history.length > 30 ? " · gráfico: últimas 30" : ""}</span></div>
      <div className="progress-table-wrap" role="region" aria-label="Histórico de força, role horizontalmente se necessário" tabIndex={0}><table className="data-table strength-table"><caption className="sr-only">Melhores séries por sessão de {activeName}</caption><thead><tr><th>Data</th><th>Melhor série</th><th>e1RM estimado</th><th>Registro</th></tr></thead><tbody>{table.map(point => <tr key={point.log.id}><td>{formatDate(point.log.date, { day: "2-digit", month: "short", year: "numeric" })} {point.log.demo && <Badge color="amber">Exemplo</Badge>}</td><td>{formatNumber(point.bestSet.weight, 3)} kg × {point.bestSet.reps}</td><td>{formatNumber(point.estimate, 1)} kg</td><td><button type="button" className="text-link" aria-label={`Abrir ${point.log.name} de ${formatDate(point.log.date, { day: "2-digit", month: "long", year: "numeric" })}`} onClick={() => onLog(point.log)}>Abrir sessão</button></td></tr>)}</tbody></table></div>
    </> : <EmptyState title={loggedExercises.length ? "Sem carga externa neste período" : "Sua curva começa no próximo treino"} text={loggedExercises.length ? "Séries com carga zero não permitem estimar o peso total movido. Registre uma série com carga externa para ver o e1RM." : "Registre séries de trabalho ou inclua os exemplos para explorar o gráfico."} />}
    <InfoNote>O gráfico usa séries concluídas de trabalho com carga externa acima de zero. Aquecimentos, séries incompletas e sessões futuras não entram; exemplos só aparecem se você incluí-los. e1RM é uma estimativa, não um teste máximo, e fica menos confiável com muitas repetições. Compare a mesma execução.</InfoNote>
  </section>;
}
