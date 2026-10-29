"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Bell, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, Dumbbell, LayoutGrid, Leaf, Library, Loader2, Menu, Search, SlidersHorizontal, Sparkles, Target, TrendingUp, WifiOff, X, AlertCircle } from "lucide-react";
import type { AppData, View, WorkoutLog, WorkoutPlan } from "@/lib/types";
import { recommendation } from "@/lib/engine";
import { loadLocalData, localErrorMessage, performLocalAction, subscribeToLocalChanges } from "@/lib/local-store";
import { appDataSchema } from "@/lib/validation";
import { Dashboard } from "./dashboard";
import { ExercisesView, JournalView, ProgressView, WorkoutsView } from "./library-views";
import { AssistantView, SettingsView } from "./assistant-settings";
import { CheckInDialog, ExerciseDetail, ExerciseEditor, GuideDialog, LogDetail, PlanEditor, RegisterDialog, WorkoutSession } from "./dialogs";
import { IconButton } from "./ui";

type Dialog = { type: "register" } | { type: "session"; plan: WorkoutPlan; manual: boolean } | { type: "plan"; plan?: WorkoutPlan } | { type: "exercise"; exercise: AppData["exercises"][number] } | { type: "exercise-edit"; exercise?: AppData["exercises"][number] } | { type: "log"; log: WorkoutLog } | { type: "checkin" } | { type: "guide" } | null;
interface QueueItem { action: string; payload: unknown; message?: string }
const LOCAL_MODE = process.env.NEXT_PUBLIC_FORMA_STORAGE === "local";
const QUEUE_KEY = "forma-offline-queue";
function readQueue(): QueueItem[] { try { const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); return Array.isArray(raw) ? raw : []; } catch { return []; } }
function writeQueue(q: QueueItem[]) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
const NAV = [
  { view: "overview", label: "Visão geral", hash: "visao-geral", icon: LayoutGrid },
  { view: "workouts", label: "Meus treinos", hash: "meus-treinos", icon: Dumbbell },
  { view: "exercises", label: "Exercícios", hash: "exercicios", icon: Library },
  { view: "journal", label: "Diário de treino", hash: "diario", icon: BookOpen },
  { view: "progress", label: "Evolução", hash: "evolucao", icon: TrendingUp },
  { view: "assistant", label: "Assistente", hash: "assistente", icon: Sparkles },
  { view: "settings", label: "Configurações", hash: "configuracoes", icon: SlidersHorizontal },
] as const;
export default function FormaApp({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData), [view, setView] = useState<View>("overview"), [dialog, setDialog] = useState<Dialog>(null), [mobile, setMobile] = useState(false);
  const [status, setStatus] = useState<"loading" | "synced" | "error" | "saving">("loading"), [toast, setToast] = useState<{ text: string; error: boolean; id: number } | null>(null), [notifications, setNotifications] = useState(false), [unread, setUnread] = useState(true), [queueLen, setQueueLen] = useState(0);
  const [localReady, setLocalReady] = useState(!LOCAL_MODE);
  const [recoveryError, setRecoveryError] = useState("");
  const recoveryInput = useRef<HTMLInputElement>(null);
  const initialization = useRef<Promise<void>>(Promise.resolve());
  const settingsDirty = useRef(false);
  const setSettingsDirty = useCallback((dirty: boolean) => { settingsDirty.current = dirty; }, []);
  const notificationRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const notify = useCallback((text: string, error = false) => setToast({ text, error, id: Date.now() }), []);
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      if (LOCAL_MODE) {
        setData(await loadLocalData());
        setLocalReady(true);
      } else {
        const res = await fetch("/api/app", { cache: "no-store" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setData(result.data);
      }
      setStatus("synced");
    } catch (error) {
      setStatus("error");
      notify(LOCAL_MODE ? localErrorMessage(error) : "Não foi possível sincronizar. Confira a conexão e tente novamente.", true);
    }
  }, [notify]);
  useEffect(() => { initialization.current = Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Wait for the closed drawer's visibility rule to be removed before focusing it.
    let focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>(".nav-item")?.focus());
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter(item => item.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(focusFrame); document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, [mobile]);
  useEffect(() => { document.documentElement.dataset.theme = data.settings.appearance; }, [data.settings.appearance]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5200); return () => clearTimeout(timer); }, [toast]);
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) { setQueueLen(0); return; }
    let flushed = 0;
    for (const item of queue) {
      try {
        const res = await fetch("/api/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: item.action, payload: item.payload }) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setData(result.data);
        flushed++;
      } catch { break; }
    }
    const remaining = queue.slice(flushed);
    writeQueue(remaining);
    setQueueLen(remaining.length);
    if (flushed) { setStatus("synced"); notify(`Conexão recuperada: ${flushed} alteração(ões) offline enviada(s) ao seu histórico.`); }
  }, [notify]);
  useEffect(() => {
    if (LOCAL_MODE) return;
    const timer = setInterval(flushQueue, 20000);
    window.addEventListener("online", flushQueue);
    return () => { clearInterval(timer); window.removeEventListener("online", flushQueue); };
  }, [flushQueue]);
  useEffect(() => {
    if (!LOCAL_MODE) return;
    return subscribeToLocalChanges(() => {
      loadLocalData().then(setData).catch(error => notify(localErrorMessage(error), true));
    });
  }, [notify]);
  const navigate = useCallback((next: View) => {
    if (next !== "settings" && settingsDirty.current) {
      if (!confirm("Sair sem salvar suas preferências?")) return;
      settingsDirty.current = false;
    }
    setView(next); setMobile(false); setNotifications(false);
    const item = NAV.find(n => n.view === next);
    if (item) window.location.hash = item.hash;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const openSearch = useCallback(() => {
    navigate("exercises");
    requestAnimationFrame(() => document.getElementById("exercise-search")?.focus());
  }, [navigate]);
  useEffect(() => {
    const hash = () => {
      const next = NAV.find(n => n.hash === window.location.hash.slice(1));
      if (!next) return;
      if (next.view !== "settings" && settingsDirty.current) {
        if (!confirm("Sair sem salvar suas preferências?")) { history.replaceState(null, "", "#configuracoes"); return; }
        settingsDirty.current = false;
      }
      setView(next.view); setMobile(false);
    };
    hash(); window.addEventListener("hashchange", hash);
    const shortcuts = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"][aria-modal="true"]')) { e.preventDefault(); openSearch(); } if (e.key === "Escape") { setNotifications(false); setMobile(false); } };
    window.addEventListener("keydown", shortcuts);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (settingsDirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    const clickAway = (e: MouseEvent) => { if (!notificationRef.current?.contains(e.target as Node)) setNotifications(false); };
    window.addEventListener("mousedown", clickAway);
    return () => { window.removeEventListener("hashchange", hash); window.removeEventListener("keydown", shortcuts); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("mousedown", clickAway); };
  }, [navigate, openSearch]);
  async function action(name: string, payload: unknown, message?: string) {
    await initialization.current;
    setStatus("saving");
    if (LOCAL_MODE) {
      try {
        setData(await performLocalAction(name, payload));
        setStatus("synced");
        if (message) notify(message);
        return true;
      } catch (error) {
        setStatus("error");
        notify(localErrorMessage(error), true);
        return false;
      }
    }
    try {
      const res = await fetch("/api/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, payload }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Não foi possível salvar.");
      setData(result.data);
      setStatus("synced");
      if (message) notify(message);
      return true;
    } catch (e) {
      const networkDown = e instanceof TypeError;
      if (networkDown || !navigator.onLine) {
        const queue = readQueue();
        queue.push({ action: name, payload, message });
        writeQueue(queue);
        setQueueLen(queue.length);
        setStatus("error");
        notify(`Offline: sua alteração foi guardada no aparelho e será enviada automaticamente quando a conexão voltar.`, true);
        return false;
      }
      setStatus("error");
      notify(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.", true);
      return false;
    }
  }
  const openStart = (plan: WorkoutPlan) => setDialog({ type: "session", plan, manual: false });
  const openPlan = (plan: WorkoutPlan) => setDialog({ type: "plan", plan });
  const openLog = (log: WorkoutLog) => setDialog({ type: "log", log });
  const openDetail = (exercise: AppData["exercises"][number]) => setDialog({ type: "exercise", exercise });
  const openRegister = () => setDialog({ type: "register" });
  const openNew = () => setDialog({ type: "plan" });
  const close = () => setDialog(null);
  const initials = data.settings.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const active = NAV.find(n => n.view === view)!;
  async function restoreOnStartup(file?: File) {
    setRecoveryError("");
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("O backup deve ter até 10 MB.");
      const backup: unknown = JSON.parse(await file.text());
      if (!backup || typeof backup !== "object" || !("version" in backup) || backup.version !== 1 || !appDataSchema.safeParse(backup).success) throw new Error("Este arquivo não é um backup completo válido do Forma.");
      if (!confirm("Restaurar o backup substituirá os dados atuais deste navegador. Deseja continuar?")) return;
      const restored = await performLocalAction("restoreBackup", backup);
      setData(restored); setLocalReady(true); setStatus("synced"); notify("Backup restaurado neste navegador.");
    } catch (error) { setRecoveryError(error instanceof SyntaxError ? "Arquivo JSON inválido. Nenhum dado foi alterado." : localErrorMessage(error)); }
  }
  if (LOCAL_MODE && !localReady) return <main id="main-content" className="startup-status" aria-live="polite">
    <h1>Forma</h1>
    {status === "error" ? <><p>Não foi possível abrir os dados deste navegador. Eles não foram substituídos.</p><button className="button button-primary" onClick={() => { initialization.current = load(); }}>Tentar novamente</button><input ref={recoveryInput} className="sr-only" type="file" tabIndex={-1} accept="application/json,.json" aria-label="Selecionar backup para recuperação" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void restoreOnStartup(file); }} /><button className="button button-secondary" onClick={() => recoveryInput.current?.click()}>Restaurar um backup</button>{recoveryError && <p className="form-error" role="alert">{recoveryError}</p>}</> : <p>Preparando seu espaço neste navegador…</p>}
    {toast && <p className="form-error" role="alert">{toast.text}</p>}
  </main>;
  return <div className="app-shell">
    {mobile && <button className="sidebar-overlay" aria-label="Fechar navegação" onClick={() => setMobile(false)} />}
    <aside ref={sidebarRef} id="main-sidebar" className={`sidebar ${mobile ? "is-open" : ""}`}>
      <a className="brand" href="#visao-geral" onClick={e => { e.preventDefault(); navigate("overview"); }} aria-label="Forma. Treino com intenção — voltar à visão geral"><span className="brand-top"><svg className="brand-symbol" viewBox="0 0 32 35" aria-hidden="true"><path d="M3 9C3 5.7 5.7 3 9 3h18v6H11a2 2 0 0 0-2 2v1h14v6H11a2 2 0 0 0-2 2v12H3V9Z" fill="currentColor" /><path d="M14 23h9v6h-9z" fill="#a5bca0" /></svg><span className="brand-word">forma<span>.</span></span></span><span className="brand-tagline">TREINO COM INTENÇÃO</span></a>
      <span className="nav-section-title">SEU ESPAÇO</span>
      <nav className="main-nav" aria-label="Navegação principal">{NAV.slice(0, 5).map(({ view: v, label, hash, icon: Icon }) => <a href={`#${hash}`} key={v} className={`nav-item ${view === v ? "active" : ""}`} aria-current={view === v ? "page" : undefined} onClick={e => { e.preventDefault(); navigate(v); }} title={label}><Icon size={19} strokeWidth={1.65} /><span>{label}</span>{view === v && <i className="nav-active-dot" />}</a>)}</nav>
      <span className="nav-section-title intelligence-label">MAIS INTELIGÊNCIA</span>
      <nav className="main-nav secondary-nav" aria-label="Assistente e preferências">{NAV.slice(5).map(({ view: v, label, hash, icon: Icon }) => <a href={`#${hash}`} key={v} className={`nav-item ${view === v ? "active" : ""}`} aria-current={view === v ? "page" : undefined} title={label} onClick={e => { e.preventDefault(); navigate(v); }}><Icon size={19} strokeWidth={1.65} /><span>{label}</span>{v === "assistant" && <small className="nav-new">NOVO</small>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-guide"><span className="guide-mini-icon"><Leaf size={18} strokeWidth={1.5} /></span><svg className="guide-decoration" viewBox="0 0 100 90" aria-hidden="true"><path d="M85 100C25 85 20 48 56 35c35-14 32 37 5 26C31 49 40 9 92 0M107 99C47 91 39 64 74 50c35-14 30 29 7 23C60 65 54 26 104 15" fill="none" stroke="currentColor" strokeWidth="1" /></svg><h3>Menos achismo.<br />Mais intenção.</h3><p>Importe seu diário, leia a fadiga,<br />registre na academia.</p><button onClick={() => { setMobile(false); setDialog({ type: "guide" }); }}>Explore o guia Forma <ArrowUpRight size={14} /></button></div><button className="profile-button" onClick={() => navigate("settings")} title="Configurar meu perfil"><span className="profile-avatar">{initials}</span><span className="profile-copy"><strong>{data.settings.name}</strong><small>{data.settings.level}</small></span><ChevronDown size={15} /></button><button className={`sync-status ${status === "error" ? "sync-error" : ""}`} onClick={() => { if (status === "error") { initialization.current = load(); } if (queueLen) flushQueue(); }} title={LOCAL_MODE ? "Dados salvos apenas neste navegador" : queueLen ? `${queueLen} alteração(ões) aguardando conexão` : "Seus dados são salvos no banco de dados"}>{queueLen ? <WifiOff size={10} /> : status === "loading" || status === "saving" ? <Loader2 size={10} className="spin" /> : status === "error" ? <WifiOff size={10} /> : <span />}{queueLen ? `${queueLen} na fila offline` : status === "loading" ? "Preparando seu espaço" : status === "saving" ? "Salvando suas escolhas" : status === "error" ? LOCAL_MODE ? "Alteração não salva — verificar" : "Tentar sincronizar novamente" : LOCAL_MODE ? "Salvo neste navegador" : "Tudo salvo. Tudo seu."}</button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><IconButton className="mobile-menu" label="Abrir navegação" aria-expanded={mobile} aria-controls="main-sidebar" onClick={() => setMobile(true)}><Menu size={22} /></IconButton><span className="breadcrumb-home">Meu espaço</span><ChevronRight size={12} /><span className="breadcrumb-current">{active.label}</span></div><div className="topbar-right"><button className="topbar-search" aria-label="Buscar exercício ⌘ K" onClick={openSearch}><Search size={16} /><span>Buscar exercício</span><kbd>⌘ K</kbd></button><i className="topbar-divider" /><button className="goal-label" onClick={() => navigate("settings")}><Target size={14} /><span>{data.settings.goal}</span></button><div className="notifications-wrap" ref={notificationRef}><IconButton label="Abrir notificações" className="notification-button" aria-expanded={notifications} onClick={() => { setNotifications(!notifications); setUnread(false); }}><Bell size={18} strokeWidth={1.6} />{unread && <i />}</IconButton>{notifications && <div className="notifications-panel"><div><h3>No seu ritmo</h3><span>Atualizações do seu espaço</span></div><button onClick={() => navigate("assistant")}><span><Sparkles size={19} /></span><div><strong>Seu próximo passo está pronto</strong><p>{recommendation(data)?.plan.name ?? "Crie um programa"} pode ser uma boa escolha. Entenda por quê.</p></div><ChevronRight size={14} /></button><button onClick={() => { setNotifications(false); setDialog({ type: "checkin" }); }}><span><Activity size={19} /></span><div><strong>Como você está hoje?</strong><p>Seu check-in deixa a estimativa de recuperação mais pessoal.</p></div><ChevronRight size={14} /></button><p>Estimativas orientam. Você decide.</p></div>}</div></div></header>
      <main className="main-content" id="main-content">{view === "overview" && <Dashboard data={data} onNavigate={navigate} onStart={openStart} onEdit={openPlan} onLog={openLog} onRegister={openRegister} onCheckIn={() => setDialog({ type: "checkin" })} />}{view === "workouts" && <WorkoutsView data={data} onStart={openStart} onEdit={openPlan} onNew={openNew} onNavigate={navigate} action={action} notify={notify} />}{view === "exercises" && <ExercisesView data={data} onDetail={openDetail} onNew={() => setDialog({ type: "exercise-edit" })} action={action} />}{view === "journal" && <JournalView data={data} onLog={openLog} onRegister={openRegister} action={action} />}{view === "progress" && <ProgressView data={data} onNavigate={navigate} />}{view === "assistant" && <AssistantView data={data} action={action} onStart={openStart} onNavigate={navigate} onDetail={openDetail} onCheckIn={() => setDialog({ type: "checkin" })} />}{view === "settings" && <SettingsView data={data} action={action} localMode={LOCAL_MODE} onDirtyChange={setSettingsDirty} />}</main>
    </div>
    {dialog?.type === "register" && <RegisterDialog data={data} onPick={plan => setDialog({ type: "session", plan, manual: true })} onNew={openNew} onClose={close} />}
    {dialog?.type === "session" && <WorkoutSession data={data} plan={dialog.plan} manual={dialog.manual} action={action} onClose={close} />}
    {dialog?.type === "plan" && <PlanEditor initial={dialog.plan} data={data} action={action} onClose={close} />}
    {dialog?.type === "exercise" && <ExerciseDetail key={dialog.exercise.id} exercise={data.exercises.find(e => e.id === dialog.exercise.id) ?? dialog.exercise} data={data} action={action} onClose={close} onEdit={() => setDialog({ type: "exercise-edit", exercise: data.exercises.find(e => e.id === dialog.exercise.id) ?? dialog.exercise })} onDetail={openDetail} />}
    {dialog?.type === "exercise-edit" && <ExerciseEditor initial={dialog.exercise} action={action} onClose={close} />}
    {dialog?.type === "log" && <LogDetail log={dialog.log} data={data} action={action} onClose={close} />}
    {dialog?.type === "checkin" && <CheckInDialog data={data} action={action} onClose={close} />}
    {dialog?.type === "guide" && <GuideDialog onClose={close} />}
    {toast && <div key={toast.id} className={`toast ${toast.error ? "error-toast" : ""}`} role={toast.error ? "alert" : "status"}>{toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{toast.text}</span><button aria-label="Fechar aviso" onClick={() => setToast(null)}><X size={16} /></button></div>}
  </div>;
}
