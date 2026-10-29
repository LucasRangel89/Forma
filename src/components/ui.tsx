"use client";
import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { X, ArrowUpRight, Sparkles, Dumbbell, Loader2 } from "lucide-react";
import type { Muscle } from "@/lib/types";

export type Action = (action: string, payload: unknown, message?: string) => Promise<boolean>;
export function Button({ children, variant = "primary", className = "", loading, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "mint" | "danger"; loading?: boolean }) {
  return <button className={`button button-${variant} ${className}`} {...props} disabled={props.disabled || loading}>{loading ? <Loader2 size={16} className="spin" /> : null}{children}</button>;
}
export function IconButton({ children, label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}
export function Badge({ children, color = "green", dot = false }: { children: ReactNode; color?: "green" | "amber" | "gray" | "purple"; dot?: boolean }) {
  return <span className={`badge badge-${color}`}>{dot && <i />}{children}</span>;
}
export function SectionHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}
export function TextLink({ children, onClick, arrow = false }: { children: ReactNode; onClick: () => void; arrow?: boolean }) {
  return <button className="text-link" type="button" onClick={onClick}>{children}{arrow && <ArrowUpRight size={15} />}</button>;
}
export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Dumbbell size={26} strokeWidth={1.5} /></div><h3>{title}</h3><p>{text}</p>{children}</div>;
}
export function useBeforeUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
export function Modal({ title, eyebrow, children, onClose, wide = false, footer }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])
          .filter(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== "hidden");
        if (!items.length) { e.preventDefault(); ref.current?.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { first.focus(); e.preventDefault(); }
      }
    };
    document.addEventListener("keydown", listener);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", listener); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><IconButton label="Fechar janela" onClick={onClose}><X size={21} /></IconButton></div><div className="modal-body" tabIndex={0}>{children}</div>{footer && <div className="modal-footer">{footer}</div>}</div></div>;
}
export function InfoNote({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" }) {
  return <div className={`info-note ${tone === "amber" ? "info-amber" : ""}`}><Sparkles size={17} strokeWidth={1.6} /><div>{children}</div></div>;
}
export function BodyMap({ recovery, back = false, className = "", colorFor }: { recovery: Record<Muscle, number>; back?: boolean; className?: string; colorFor?: (value: number) => string }) {
  const color = (m: Muscle) => colorFor ? colorFor(recovery[m]) : recovery[m] > 60 ? "#c69875" : recovery[m] > 30 ? "#d2bc86" : "#a7c3ac";
  const stroke = "#fafbf8";
  return <svg className={`body-map ${className}`} viewBox="0 0 110 240" role="img" aria-label={`Mapa de recuperação muscular, vista ${back ? "posterior" : "anterior"}. Verde: recuperado; amarelo: recuperando; laranja: alta fadiga.`}>
    <path d="M43 22C43 11 47 5 55 5s12 6 12 17l-3 13-4 5v7l15 6c8 3 10 13 12 22l7 31 6 27 6 21-1 11-5 5-4-7-4-7-2-14-8-26-9-24-2 26 3 22 3 21-5 32-5 25 1 15 3 7-1 7-13 1-1-7 2-13-1-20-3-25-4-17-4 17-3 25-1 20 2 13-1 7-13-1-1-7 3-7 1-15-5-25-5-32 3-21 3-22-2-26-9 24-8 26-2 14-4 7-4 7-5-5-1-11 6-21 6-27 7-31c2-9 4-19 12-22l15-6v-7l-4-5Z" fill="#e7eae3" stroke="#dce1d8" strokeWidth=".7" />
    <path d="M44 19c1-7 4-10 11-10s10 3 11 10l-2 12-9 8-9-8Z" fill="#e3e7df" />
    <path d="m46 41 9 5 9-5v8l-9 5-9-5Z" fill="#e0e6dc" />
    {back ? <>
      <path d="m45 48 10 7 10-7 7 8-10 16-7 10-7-10-10-16Z" fill={color("trapezio-medio")} stroke={stroke} />
      <path d="m36 58 10 15 8 12-1 28-12-9-5-23Z M74 58 64 73 56 85l1 28 12-9 5-23Z" fill={color("dorsais")} stroke={stroke} />
      <path d="m41 107 12 10v17l-14 3Z M69 107l-12 10v17l14 3Z" fill={color("lombar")} stroke={stroke} />
      <path d="m39 133 14 4v23l-7 4-10-6Z M71 133l-14 4v23l7 4 10-6Z" fill={color("gluteos")} stroke={stroke} />
      <path d="m36 162 11 4 6-5-5 33-9 6Z M74 162l-11 4-6-5 5 33 9 6Z" fill={color("posterior")} stroke={stroke} />
      <path d="m38 202 9-5-1 18-5 11-3-8Z M72 202l-9-5 1 18 5 11 3-8Z" fill={color("panturrilha")} stroke={stroke} />
    </> : <>
      <path d="m39 57 14 3v18l-9 4-12-9Z M71 57l-14 3v18l9 4 12-9Z" fill={color("peito-esternal")} stroke={stroke} strokeWidth="1.4" />
      <path d="m38 54 15 3v3l-14-3Z M72 54l-15 3v3l14-3Z" fill={color("peito-clavicular")} />
      <path d="m45 84 8-3v10l-9 1Z M65 84l-8-3v10l9 1Z M44 94l9-1v10l-9-1Z M66 94l-9-1v10l9-1Z M44 105l9 1v10l-8-2Z M66 105l-9 1v10l8-2Z M45 117l8 2v14l-6-8Z M65 117l-8 2v14l6-8Z" fill={color("abdomen")} stroke={stroke} strokeWidth=".5" />
      <path d="m35 81 7 6-2 32-5-13Z M75 81l-7 6 2 32 5-13Z" fill={color("abdomen")} opacity=".75" />
      <path d="m36 137 12-4 5 13-6 38-7 8-5-20Z M74 137l-12-4-5 13 6 38 7 8 5-20Z" fill={color("quadriceps")} stroke={stroke} strokeWidth="1.2" />
      <path d="m47 142 5 7-4 30-3-14Z M63 142l-5 7 4 30 3-14Z" fill={color("adutores")} stroke={stroke} strokeWidth=".6" />
      <path d="m37 201 7-5 2 8-5 22-3-8Z M73 201l-7-5-2 8 5 22 3-8Z" fill={color("panturrilha")} stroke={stroke} />
    </>}
    <path d="m34 55 5 3-7 19-8 3 1-10Z M76 55l-5 3 7 19 8 3-1-10Z" fill={color(back ? "deltoide-posterior" : "deltoide-lateral")} stroke={stroke} />
    <path d="m24 82 7-5-4 23-6 13-4-4Z M86 82l-7-5 4 23 6 13 4-4Z" fill={color(back ? "triceps-longo" : "biceps")} stroke={stroke} />
    <path d="m16 113 6 3-10 27-4 7 3-20Z M94 113l-6 3 10 27 4 7-3-20Z" fill={color("antebraco")} opacity=".75" stroke={stroke} />
    <path d="M55 51v83" stroke={stroke} strokeWidth="1.3" />
  </svg>;
}
export function MiniTrend({ values = [6, 5, 7, 6, 9, 8, 11, 12], color = "#738f7c" }: { values?: number[]; color?: string }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const points = values.map((v, i) => `${i * 12},${35 - ((v - min) / (max - min || 1)) * 30}`).join(" ");
  return <svg viewBox={`0 0 ${(values.length - 1) * 12} 40`} className="mini-trend" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
