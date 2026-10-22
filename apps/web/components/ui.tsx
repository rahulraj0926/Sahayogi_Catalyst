'use client';
import { createContext, ReactNode, useContext } from 'react';
import { tone } from '@/lib/api';

export const Badge = ({ children, kind }: { children: ReactNode; kind?: string }) => <span className={`badge ${kind ?? tone(String(children))}`}>{children}</span>;
export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorBox = ({ message }: { message: string }) => <div className="err-box">{message}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="loading">{children}</div>;
export function Bar({ pct, kind = 'ok' }: { pct: number; kind?: string }) {
  return <div className="bar"><i className={kind} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
export function Card({ title, sub, right, children, flush }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {title && <div className="card-h"><h2>{title}</h2>{sub && <span className="sub">{sub}</span>}<span className="spacer" />{right}</div>}
      <div className={`card-b${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}
/** True while a screen is shown as one section of a hub page: it then leaves out its own page title. */
export const EmbedContext = createContext(false);
export function Page({ title, right, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const embedded = useContext(EmbedContext);
  if (embedded) return <>{right && <div className="mb-3 flex flex-wrap justify-end gap-2">{right}</div>}{children}</>;
  return (
    <>
      <div className="page-head"><div><h1>{title}</h1></div><span className="spacer" />{right}</div>
      {children}
    </>
  );
}
