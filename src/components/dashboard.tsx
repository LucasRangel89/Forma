"use client";
import { useState } from "react";
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Dumbbell, Flame, Info, Layers3, Leaf, Play, Plus, ScrollText, Shield, Sparkles, Target, Timer, Trophy, TrendingUp, X } from "lucide-react";
import { COARSE_GROUPS, MUSCLE_GROUPS, type AppData, type View, type WorkoutLog, type WorkoutPlan } from "@/lib/types";
import { STATE_COLORS, bossInfo, fatigue, fatigueState, formatDate, formatNumber, groupFatigue, logEffectiveSets, logSets, logTonnage, planMinutes, readiness, recommendation, rankInfo, recentLogs, storyCard, streakDays, totalSets, totalXp, weeklyVolume } from "@/lib/engine";
import { Badge, BodyMap, Button, IconButton, MiniTrend, SectionHeading, TextLink } from "./ui";

interface Props { data: AppData; onNavigate: (view: View) => void; onStart: (plan: WorkoutPlan) => void; onEdit: (plan: WorkoutPlan) => void; onLog: (log: WorkoutLog) => void; onRegister: () => void; onCheckIn: () => void }
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-description">{description}</p></div><div className="page-actions">{children}</div></div>;
}
export function Dashboard({ data, onNavigate, onStart, onEdit, onLog, onRegister, onCheckIn }: Props) {
  const current = recentLogs(data.logs);
  const weekSets = current.reduce((sum, l) => sum + logEffectiveSets(l), 0);
  const minutes = current.reduce((sum, l) => sum + l.duration, 0);
  const ready = readiness(data);
  const recommended = recommendation(data);
  const recover = fatigue(data);
  const scale = data.settings.fatigueScale;
  const colorFor = (v: number) => STATE_COLORS[fatigueState(v, scale).id];
  const volume = weeklyVolume(data, new Date(), "week");
  const coverage = Math.round(volume.reduce((sum, v) => sum + Math.min(v.value / Math.max(v.target, 1), 1), 0) / volume.length * 100);
  const dailyHistory = Array.from({ length: 7 }, (_, i) => {
    const end = new Date(Date.now() - (6 - i) * 86400000);
    return { sets: recentLogs(data.logs, end, 1).reduce((n, log) => n + logSets(log), 0), readiness: readiness(data, end) };
  });
  return <div className="page-enter dashboard">
    <PageHeading title="Seu treino, em equilíbrio." description="Cada sessão conta. Encontre seu próximo passo."><Button onClick={onRegister}><Plus size={17} />Registrar treino</Button></PageHeading>
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-top"><span>Treinos na semana</span><span className="stat-icon"><Dumbbell size={17} /></span></div><div className="stat-value">{current.length}<span>/ {data.settings.days} planejados</span></div><div className="stat-bottom"><div className="session-progress">{Array.from({ length: data.settings.days }, (_, i) => <i key={i} className={i < current.length ? "filled" : ""} />)}</div><span>{Math.round(current.length / data.settings.days * 100)}% da meta</span></div></div>
      <div className="stat-card"><div className="stat-top"><span>Séries efetivas</span><span className="stat-icon"><Layers3 size={17} /></span></div><div className="stat-value">{weekSets}<span>nos últimos 7 dias</span></div><div className="stat-bottom"><span className="positive"><TrendingUp size={13} />{coverage}% da cobertura semanal</span><div className="mini-bars" role="img" aria-label={`Séries nos últimos 7 dias: ${dailyHistory.map(d => d.sets).join(", ")}`}>{dailyHistory.map((day, i) => <i key={i} title={`${day.sets} séries`} style={{ height: `${Math.max(3, day.sets / Math.max(...dailyHistory.map(d => d.sets), 1) * 24)}px` }} />)}</div></div></div>
      <div className="stat-card"><div className="stat-top"><span>Prontidão geral</span><span className="stat-icon"><Activity size={17} /></span></div><div className="stat-value">{ready}<span className="stat-unit">%</span><Badge color={ready > 70 ? "green" : "amber"}>{ready > 80 ? "Muito boa" : ready > 60 ? "Boa" : "Atenção"}</Badge></div><div className="stat-bottom"><span>Seu corpo, no seu ritmo</span><MiniTrend values={dailyHistory.map(d => d.readiness)} /></div></div>
      <div className="stat-card"><div className="stat-top"><span>Tempo de treino</span><span className="stat-icon"><Clock3 size={17} /></span></div><div className="stat-value">{Math.floor(minutes / 60)}<span className="stat-unit time-unit">h</span>{minutes % 60}<span className="stat-unit time-unit">min</span></div><div className="stat-bottom"><span><span className="positive">{current.length ? Math.round(minutes / current.length) : 0} min</span> em média por sessão</span><span className="tiny-clock"><Clock3 size={25} strokeWidth={1.2} /></span></div></div>
    </div>
    {data.settings.gamification.enabled && <GamificationRow data={data} />}
    <div className="dashboard-main-grid">
      <section className="recommended-card">
        <img className="workout-photo" src="/images/training.jpg" alt="Atleta se preparando para uma sessão de musculação" />
        <div className="workout-photo-shade" />
        <div className="recommended-content"><div className="recommendation-label"><Sparkles size={14} /><span>SEU PRÓXIMO TREINO</span></div><h2>{recommended?.plan.name ?? "Seu próximo passo"}</h2><p className="workout-subtitle">{recommended?.plan.subtitle ?? "Um plano que respeita seu ritmo"}</p><div className="workout-metadata"><span><Dumbbell size={15} />{recommended?.plan.exercises.length ?? 0} exercícios</span><i /><span><Clock3 size={15} />{recommended ? planMinutes(recommended.plan) : 0} min</span><i /><span><Layers3 size={15} />{recommended ? totalSets(recommended.plan) : 0} séries</span></div><div className="workout-actions"><Button variant="mint" onClick={() => recommended ? onStart(recommended.plan) : onNavigate("workouts")}><Play size={14} fill="currentColor" />{recommended ? "Começar treino" : "Criar meu treino"}<ArrowRight size={16} /></Button>{recommended && <button className="hero-text-link" onClick={() => onEdit(recommended.plan)}>Ver treino <ArrowUpRight size={14} /></button>}</div></div>
        <span className="hero-goal"><Target size={12} />{data.settings.goal}</span>
        <button className="recommendation-footer" onClick={() => onNavigate("assistant")}><span><i />{recommended ? `${recommended.readiness}% de prontidão estimada para esta sessão` : "Seu objetivo é o ponto de partida"}</span><span>Por que este treino? <ArrowUpRight size={13} /></span></button>
      </section>
      <RecoveryCard data={data} colorFor={colorFor} onCheckIn={onCheckIn} />
    </div>
    <div className="dashboard-main-grid second-row">
      <section className="card volume-card"><SectionHeading title="Volume semanal" subtitle="Séries efetivas · semana atual (seg–dom)." /><div className="chart-legend"><span><i />Realizado</span><span><i className="target-legend" />Meta semanal</span></div><VolumeChart data={data} /><div className="chart-footnote"><Info size={12} /><span>Séries indiretas contam {formatNumber(data.settings.indirectWeight, 1)}; RIR vazio conta como efetiva. Aquecimento não conta.</span><button onClick={() => onNavigate("settings")} title="Ajustar parâmetros de volume">Ajustar <ArrowUpRight size={12} /></button></div></section>
      <WeekCard data={data} onEdit={onEdit} onNavigate={onNavigate} />
    </div>
    <div className="assistant-banner"><div className="assistant-banner-icon"><Sparkles size={21} strokeWidth={1.5} /></div><div><strong>Um plano inteligente. A decisão é sua.</strong><p>Seu assistente conecta objetivo, volume e recuperação — sem tirar sua liberdade.</p></div><button onClick={() => onNavigate("assistant")}>Explorar assistente <ArrowUpRight size={16} /></button></div>
    <section className="card recent-card"><SectionHeading title="Últimos treinos" subtitle="Pequenos passos. Progresso de verdade."><TextLink onClick={() => onNavigate("journal")} arrow>Abrir diário</TextLink></SectionHeading><RecentTable logs={data.logs.slice(0, 3)} onLog={onLog} /></section>
    <div className="dashboard-footer"><span><Leaf size={13} />Construído para o seu ritmo.</span><span>Estimativas orientam. Seu corpo tem a última palavra.</span></div>
  </div>;
}
function GamificationRow({ data }: { data: AppData }) {
  const boss = bossInfo(data);
  const streak = streakDays(data);
  const rank = rankInfo(totalXp(data));
  const story = storyCard(data);
  return <div className="gami-grid">
    <div className="card gami-card"><span className="gami-icon boss-icon"><Shield size={20} /></span><div><h3>Boss da semana</h3><strong className="gami-value">{boss.percent}%</strong><div className="gami-bar"><i style={{ width: `${boss.percent}%` }} /></div><p>{boss.defeated ? "Boss derrotado! Semana completa." : `Restam ${100 - boss.percent}% de vida do boss.`}</p></div></div>
    <div className="card gami-card"><span className="gami-icon flame-icon"><Flame size={20} /></span><div><h3>Sequência</h3><strong className="gami-value">{streak}<small> {streak === 1 ? "dia" : "dias"}</small></strong><p>de treino seguido. Mantenha a corrente.</p></div></div>
    <div className="card gami-card"><span className="gami-icon trophy-icon"><Trophy size={20} /></span><div><h3>Rank</h3><strong className="gami-value">{rank.name}</strong>{rank.nextName && <><div className="gami-bar"><i style={{ width: `${Math.round(rank.progress * 100)}%` }} /></div><p>{rank.xp} XP · {rank.nextName} em {rank.nextXp} XP</p></>}</div></div>
    <div className="card gami-card"><span className="gami-icon scroll-icon"><ScrollText size={20} /></span><div><h3>Última semana</h3><strong className="gami-value">{story.title}</strong><p>{story.sessions} treinos · {story.sets} séries · {formatNumber(story.tonnage / 1000, 1)} t movidas</p></div></div>
  </div>;
}
function RecoveryCard({ data, colorFor, onCheckIn }: { data: AppData; colorFor: (v: number) => string; onCheckIn: () => void }) {
  const [tab, setTab] = useState<"grupos" | "grossos" | "corpo">("grupos");
  const recover = fatigue(data);
  const scale = data.settings.fatigueScale;
  const boxes = (groups: typeof COARSE_GROUPS) => <div className="fatigue-boxes">{groups.map(g => {
    const v = groupFatigue(recover, g.muscles);
    const st = fatigueState(v, scale);
    return <div className="fatigue-box" key={g.id} title={`${g.label}: ${v}% de fadiga estimada (${st.label})`}>
      <span className="fb-label">{g.label}</span>
      <strong style={{ color: STATE_COLORS[st.id] }}>{v}<small>%</small></strong>
      <div className="fb-track"><i style={{ width: `${v}%`, background: STATE_COLORS[st.id] }} /></div>
      <span className="state-chip" style={{ color: STATE_COLORS[st.id], background: `${STATE_COLORS[st.id]}1a` }}>{st.label}</span>
    </div>;
  })}</div>;
  return <section className="card recovery-card"><SectionHeading title="Recuperação"><span title="Estimativa por decaimento exponencial + seu check-in. Não é uma medição clínica." className="info-icon"><Info size={15} /></span></SectionHeading><p className="card-description">Ouça seu corpo. Ajuste seu próximo passo.</p><div className="fatigue-tabs">{([["grupos", "10 grupos"], ["grossos", "7 grossos"], ["corpo", "Corpo"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>{tab === "grupos" ? boxes(COARSE_GROUPS.length ? MUSCLE_GROUPS : COARSE_GROUPS) : tab === "grossos" ? boxes(COARSE_GROUPS) : <div className="body-maps"><div><BodyMap recovery={recover} colorFor={colorFor} /><span>FRENTE</span></div><div><BodyMap recovery={recover} back colorFor={colorFor} /><span>COSTAS</span></div></div>}<div className="recovery-legend"><span><i style={{ background: STATE_COLORS.pronto }} />Pronto</span><span><i style={{ background: STATE_COLORS.quase }} />Quase pronto</span><span><i style={{ background: STATE_COLORS.recuperando }} />Recuperando</span><span><i style={{ background: STATE_COLORS.fadigado }} />Fadigado</span><span><i style={{ background: STATE_COLORS.exausto }} />Exausto</span></div><button className="recovery-checkin" onClick={onCheckIn}><span><Activity size={14} />Como você está hoje?</span><span>Fazer check-in <ArrowRight size={13} /></span></button></section>;
}
export function VolumeChart({ data, expanded = false }: { data: AppData; expanded?: boolean }) {
  const volume = weeklyVolume(data, new Date(), "week").slice(0, expanded ? 10 : 8);
  const ceiling = Math.max(20, Math.ceil(Math.max(...volume.map(v => Math.max(v.target, v.value))) / 5) * 5);
  return <div className={`volume-chart ${expanded ? "expanded-chart" : ""}`} role="img" aria-label={`Volume semanal: ${volume.map(v => `${v.label}, ${v.value} de ${v.target} séries`).join("; ")}`}><div className="chart-scale">{[ceiling, ceiling * .75, ceiling * .5, ceiling * .25, 0].map(v => <span key={v}>{formatNumber(v, 0)}</span>)}</div><div className="chart-plot"><div className="chart-grid-lines">{[0, 1, 2, 3, 4].map(i => <i key={i} />)}</div><div className="chart-columns">{volume.map(group => <div className="volume-column" key={group.id} title={`${group.label}: ${formatNumber(group.value, 1)} / ${group.target} séries efetivas na semana (seg–dom)`}><div className="bar-space"><div className="target-bar" style={{ height: `${group.target / ceiling * 100}%` }} /><div className={`volume-bar ${group.value > group.max ? "over-volume" : ""}`} style={{ height: `${Math.max(1, group.value / ceiling * 100)}%`, backgroundColor: group.color }}><span>{formatNumber(group.value, 1)}</span></div><div className="bar-target-line" style={{ bottom: `${group.target / ceiling * 100}%` }} /></div><span className="bar-label">{group.label === "Quadríceps" ? "Quadríc." : group.label}</span></div>)}</div></div></div>;
}
function WeekCard({ data, onEdit, onNavigate }: { data: AppData; onEdit: (plan: WorkoutPlan) => void; onNavigate: (view: View) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState((new Date().getDay() + 6) % 7);
  const start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7); start.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const planned = data.plans.filter(p => p.day === dates[selected].getDay());
  const selectedLogs = data.logs.filter(l => new Date(l.date).toDateString() === dates[selected].toDateString());
  const isPast = dates[selected].getTime() < new Date().setHours(0, 0, 0, 0);
  return <section className="card week-card"><SectionHeading title="Sua semana"><div className="week-controls"><IconButton label="Semana anterior" onClick={() => setWeekOffset(v => v - 1)}><ChevronLeft size={15} /></IconButton><IconButton label="Próxima semana" onClick={() => setWeekOffset(v => v + 1)}><ChevronRight size={15} /></IconButton></div></SectionHeading><p className="card-description">{start.getDate()} – {dates[6].toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</p><div className="week-calendar">{dates.map((date, i) => {
    const done = data.logs.some(l => new Date(l.date).toDateString() === date.toDateString());
    return <button key={i} className={`calendar-day ${i === selected ? "selected" : ""} ${done ? "done" : ""} ${date.toDateString() === new Date().toDateString() ? "today" : ""}`} onClick={() => setSelected(i)} aria-label={date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}><span>{["S", "T", "Q", "Q", "S", "S", "D"][i]}</span><strong>{date.getDate()}</strong><i>{done ? <Check size={9} strokeWidth={3} /> : data.plans.some(p => p.day === date.getDay()) ? <span /> : null}</i></button>;
  })}</div><div className="week-agenda">{selectedLogs.length ? selectedLogs.slice(0, 2).map(log => <div className="agenda-row" key={log.id}><span className="agenda-type completed-type"><Check size={17} /></span><div><strong>{log.name}</strong><span>{log.duration ? `${log.duration} min · ` : ""}{logSets(log)} séries concluídas</span></div><Badge>Feito</Badge></div>) : planned.length ? planned.slice(0, 2).map(plan => <button className="agenda-row" key={plan.id} onClick={() => onEdit(plan)}><span className={`agenda-type ${plan.type === "Lower" ? "lower-type" : ""}`}><Dumbbell size={17} /></span><div><strong>{plan.name}<small>{isPast ? "Planejado" : "Próxima sessão"}</small></strong><span>{plan.exercises.length} exercícios · {planMinutes(plan)} min</span></div><ArrowUpRight size={17} /></button>) : <div className="agenda-row"><span className="agenda-type rest-type"><Leaf size={19} /></span><div><strong>Dia de recuperação</strong><span>Descansar também é evoluir.</span></div></div>}</div><button className="week-footer" onClick={() => onNavigate("workouts")}>Ver meu planejamento <ArrowRight size={14} /></button></section>;
}
export function RecentTable({ logs, onLog }: { logs: WorkoutLog[]; onLog: (log: WorkoutLog) => void }) {
  if (!logs.length) return <div className="inline-empty">Seu próximo treino será o primeiro capítulo do diário.</div>;
  return <div className="table-scroll"><table className="data-table recent-table"><thead><tr><th>Treino</th><th>Data</th><th>Duração</th><th>Volume total</th><th>Status</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{logs.map(log => <tr key={log.id} onClick={() => onLog(log)}><td><div className="table-workout"><span className={`table-workout-icon ${log.name.includes("Lower") ? "lower-type" : ""}`}><Dumbbell size={17} strokeWidth={1.6} /></span><div><strong>{log.name}</strong><span>{log.entries.length} exercícios · {logSets(log)} séries</span></div></div></td><td>{formatDate(log.date, { day: "2-digit", month: "short" })}<span className="table-secondary">{new Date(log.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></td><td><span className="table-duration"><Clock3 size={13} />{log.duration ? `${log.duration} min` : "n/d"}</span></td><td>{formatNumber(logTonnage(log))}<span className="unit"> kg</span></td><td><Badge dot>Concluído</Badge></td><td><IconButton label={`Ver registro de ${log.name}`} onClick={e => { e.stopPropagation(); onLog(log); }}><ArrowUpRight size={17} /></IconButton></td></tr>)}</tbody></table></div>;
}
