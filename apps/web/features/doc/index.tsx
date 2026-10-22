'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, ErrorBox, Loading } from '@/components/ui';
import { Sentence, ago } from '@/components/kit';
import RecordForm from '@/components/RecordForm';
import { DocBody, useDocHtml } from '@/components/DocBody';
import { go, useApi } from '@/lib/api';
import { DocTabs } from '@/components/DocTabs';
import { printDocument } from '@/lib/printDoc';
import { PHASE_SHORT } from '@/components/shell/groups';

const STAGE_NAME = PHASE_SHORT.map((n, i) => `Phase ${i}: ${n}`);
const NOISE = new Set(['settings', 'connections']);
const NOISE_TYPES = new Set(['Transition', 'State', 'FlowStep', 'Entity', 'Pointer', 'AcceptanceCriterion', 'Attachment', 'Handoff', 'Baseline']);
const NOISE_TEXT = /(move between states|a flow step|a state|a data object|a pointer|an acceptance|acceptance check|a link between|a connection)/i;
const PLAIN: [RegExp, string][] = [[/ready-for-handoff/g, 'ready for hand-over'], [/handed-off/g, 'handed over']];
const plain = (t: string) => PLAIN.reduce((x, [re, to]) => x.replace(re, to), String(t));

/** Several lines of the same kind (the same person changing the same status of many items) become one line. */
function groupFeed(entries: any[]) {
  const out: any[] = []; const seen = new Map<string, any>();
  for (const e of entries) {
    const m = /^(.+?) changed the status of ".*" from (\S+) to (\S+)$/.exec(e.text || '');
    if (!m) { out.push({ text: plain(e.text), at: e.at }); continue; }
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    if (seen.has(key)) { seen.get(key).n += 1; continue; }
    const g = { n: 1, who: m[1], from: m[2], to: m[3], at: e.at, text: '' }; seen.set(key, g); out.push(g);
  }
  return out.map((g) => (g.n === undefined ? g : { at: g.at, text: `${g.who} changed the status of ${g.n === 1 ? '1 item' : g.n + ' items'} from ${plain(g.from)} to ${plain(g.to)}` }));
}
const worth = (e: any) => !NOISE.has(e.group) && !(e.details && NOISE_TYPES.has(e.details.type)) && !NOISE_TEXT.test(e.text || '');

function Stat2({ n, label, warn }: { n: React.ReactNode; label: string; warn?: boolean }) {
  return <div style={{ minWidth: 90 }}><div style={{ fontSize: 22, fontWeight: 700, color: warn ? 'var(--warn)' : undefined }} className="tabular">{n}</div><div className="xs muted">{label}</div></div>;
}

/** A small button that opens a list of choices (links or actions) under it. */
export function Menu({ label, items }: { label: string; items: { label: string; href?: string; onClick?: () => void }[] }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!items.length) return null;
  const row: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, background: 'transparent', font: 'inherit', fontSize: 13, color: 'var(--ink)', cursor: 'pointer', minHeight: 0, borderRadius: 6 };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && <div role="menu" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 190, zIndex: 40, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 4, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
        {items.map((i) => i.href ? <a key={i.label} role="menuitem" href={i.href} style={row} onClick={() => setOpen(false)}>{i.label}</a> : <button key={i.label} role="menuitem" type="button" style={row} onClick={() => { setOpen(false); i.onClick?.(); }}>{i.label}</button>)}
      </div>}
    </div>
  );
}

/** Product document: the product's home. Where we are, what blocks us, who we wait for, what changed, then all the documentation. Prototype: living.js */
export default function ProductDoc({ pid }: FeatureProps) {
  const journey = useApi<any>('/journey', pid);
  const stages = useApi<any>('/stages', pid);
  const audit = useApi<any>('/audit?limit=40', pid);
  const docs = useApi<any>('/documents', pid);
  const sheet = useApi<any>('/sheet', pid);
  const meta = useApi<any>('/meta', pid);
  const existing = useApi<any>('/existing', pid);
  const dossier = useDocHtml('/dossier?format=html', pid);
  const [adding, setAdding] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [printing, setPrinting] = useState(false); const [printErr, setPrintErr] = useState('');
  const types = meta.data?.schema?.types || {};
  const entered = sheet.data?.plans?.length || 0;

  const view = useMemo(() => {
    if (!docs.data || !stages.data) return null;
    const current = stages.data.current as number;
    const hasContent = (d: any) => d.phase <= current || d.completeness > 0 || d.status !== 'not_started' || (d.key === 'product_definition' && entered > 0);
    return { current, hasContent, later: (docs.data.documents as any[]).filter((d) => !hasContent(d)) };
  }, [docs.data, stages.data, entered]);

  if ([journey, stages, audit, docs, sheet].some((x) => x.loading) || !dossier.ready && !dossier.error) return <Loading />;
  const bad = [journey, stages, audit, docs, sheet].find((x) => x.error);
  if (bad || !view) return <ErrorBox message={bad?.error || dossier.error || 'No data'} />;

  const st: any[] = stages.data.stages; const recheck = (s: any) => /re-check/i.test(s.state_text || '');
  const cur = st.find((s) => !s.signed_off || recheck(s)) || st[stages.data.current] || st[0];
  const open = (cur.items || []).filter((i: any) => !i.done && i.kind === 'required');
  const wy = journey.data.waiting.for_you; const wo = journey.data.waiting.for_others;
  const waitItems = [...(wy.items || []).map((x: any) => ({ who: 'You', what: x.what || x.title || 'a decision' })), ...(wo.items || []).map((x: any) => ({ who: x.approver, what: x.what || x.title || 'a decision' }))];
  const recent = groupFeed((audit.data.entries || []).filter(worth)).slice(0, 6);
  const D: any[] = docs.data.documents; const vis = D.filter((d) => d.phase <= view.current);
  const apprVis = vis.filter((d) => d.status === 'approved' || st[d.phase]?.signed_off).length; const parts = vis.reduce((m, d) => m + d.missing_count, 0);
  const prod = sheet.data.product;
  const fix = (i: any) => {
    const f = i.fix; if (!f) return null;
    return <Link className="btn sm primary" style={{ marginTop: 6 }} href={f.type === 'request' ? `/products/${pid}/work/${f.session}?step=${f.request}` : `/products/${pid}/gates/${cur.stage}`}>{f.label}</Link>;
  };
  const laterTitles = new Set(showLater ? [] : view.later.map((d: any) => d.title));

  // contents: group by stage, mark missing / approved
  const byTitle = new Map(D.map((d) => [d.title, d]));
  const toc: React.ReactNode[] = []; let last = -1;
  dossier.toc.forEach((t) => {
    const d = byTitle.get(t.text); if (!d || laterTitles.has(d.title)) return;
    if (d.phase !== last) { last = d.phase; toc.push(<div key={'s' + d.phase} className="st">{STAGE_NAME[d.phase] || `Stage ${d.phase}`}</div>); }
    toc.push(<button key={t.id} onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' })}>{t.text}
      {d.missing_count ? <span className="lv-gap" title={`${d.missing_count} parts missing`}>{d.missing_count}</span> : d.status === 'approved' || st[d.phase]?.signed_off ? <span className="lv-done">✓</span> : null}</button>);
  });
  // hide the later documents in the body with a style rule
  const STATUS_WORD: Record<string, string> = { approved: 'Approved', in_review: 'Waiting for approval', draft: 'Draft', not_started: 'Not started' };
  const eyebrowCss = D.map((d: any) => `#doc-${d.key} > h1::before{content:"Phase ${d.phase} · ${PHASE_SHORT[d.phase] || ''} · ${STATUS_WORD[d.status] || d.status} · ${d.completeness}%"}`).join('');
  const hideCss = [...laterTitles].length ? view.later.map((d: any) => `#doc-${d.key}`).map((s) => `${s}, ${s} + hr`).join(',') + '{display:none}' : '';

  const addable: [string, string][] = [['PricingPlan', 'Pricing plan'], ['Feature', 'Feature'], ['BusinessRule', 'Rule'], ['Question', 'Question']];
  const print = async () => { setPrinting(true); setPrintErr(''); try { await printDocument(`/api/v1/dossier?format=html&product=${encodeURIComponent(pid)}`, { product: prod.name, kind: 'Product document' }); } catch (e: any) { setPrintErr(e?.message || 'Could not print.'); } setPrinting(false); };
  const attention = open.length + waitItems.length;

  return (
    <div>
      <DocTabs pid={pid} active="whole" />
      {printErr && <div className="callout warn" style={{ marginBottom: 10 }}>{printErr}</div>}
      <header className="flex flex-wrap items-start justify-between gap-4" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 260, flex: 1 }}>
          <h1 style={{ fontSize: 26, letterSpacing: '-.01em' }}>{prod.name}</h1>
          {prod.one_liner && <p style={{ color: 'var(--ink-2)', fontSize: 15, maxWidth: '70ch', marginTop: 4 }}>{prod.one_liner}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Menu label="Add" items={addable.filter(([t]) => types[t]).map(([t, l]) => ({ label: l, onClick: () => setAdding(t) })).concat(existing.data?.applies ? [{ label: 'Old-system function', onClick: () => { window.location.href = `/products/${pid}/existing`; } }] : [])} />
          <Menu label="Download" items={[{ label: 'HTML (opens in Word)', href: `/api/v1/dossier?format=html&download=1&product=${pid}` }, { label: 'Markdown', href: `/api/v1/dossier?format=md&download=1&product=${pid}` }]} />
          <button className="btn primary" disabled={printing} onClick={print}>{printing ? 'Preparing…' : 'Print'}</button>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3" style={{ padding: '14px 18px' }}>
          <div style={{ minWidth: 220, flex: '1 1 260px' }}>
            <div className="xs muted">Now in</div>
            <div className="strong" style={{ fontSize: 16 }}>Stage {cur.stage}: {cur.name}</div>
            <div className="flex items-center gap-2" style={{ marginTop: 6 }}><div className="bar" style={{ flex: 1, margin: 0 }}><i className="accent" style={{ width: `${cur.readiness || 0}%` }} /></div><b className="small tabular">{cur.readiness || 0}%</b></div>
            <div className="xs muted" style={{ marginTop: 3 }}>{cur.required_done} of {cur.required_total} needed for sign-off done</div>
          </div>
          <Stat2 n={`${apprVis} of ${vis.length}`} label="documents signed off" />
          <Stat2 n={parts} label={parts === 1 ? 'part missing' : 'parts missing'} warn={parts > 0} />
          <Stat2 n={open.length} label="blocking sign-off" warn={open.length > 0} />
          <Stat2 n={waitItems.length} label="waiting on people" />
        </div>
        <details className="lv-more" style={{ borderTop: '1px solid var(--line)' }}>
          <summary style={{ cursor: 'pointer', padding: '10px 18px', fontWeight: 600, fontSize: 13 }}>What needs attention{attention ? ` (${attention})` : ''} and what changed</summary>
          <div className="grid g3" style={{ padding: '4px 18px 18px', gap: 24 }}>
            <div><div className="strong small" style={{ marginBottom: 6 }}>Blocking this stage</div>
              {open.length ? <ul className="lv-list">{open.slice(0, 4).map((i: any) => <li key={i.id}><b>{i.need}</b><span className="when">{i.todo}</span>{fix(i)}</li>)}</ul> : <div className="lv-ok">Nothing is blocking it.</div>}
              {open.length > 4 && <div className="lv-sub"><Link href={`/products/${pid}/gates`}>{open.length - 4} more</Link></div>}</div>
            <div><div className="strong small" style={{ marginBottom: 6 }}>Waiting for</div>
              {waitItems.length ? <ul className="lv-list">{waitItems.slice(0, 5).map((x, i) => <li key={i}><b>{x.who}</b> to {x.what}</li>)}</ul> : <div className="lv-sub">Nobody.</div>}
              {(wo.count || wy.total) ? <div className="lv-sub"><Link href={`/products/${pid}/approvals`}>See everything waiting</Link></div> : null}</div>
            <div><div className="strong small" style={{ marginBottom: 6 }}>Changed lately</div>
              {recent.length ? <ul className="lv-list">{recent.slice(0, 4).map((e, i) => <li key={i}><Sentence text={e.text} /><span className="when">{ago(e.at)}</span></li>)}</ul> : <div className="lv-sub">Nothing recorded yet.</div>}
              <div className="lv-sub"><Link href={`/products/${pid}/admin`}>Full history</Link></div></div>
          </div>
        </details>
      </section>

      <div className="lv-wrap">
        <nav className="lv-toc card"><div className="card-b" style={{ padding: 10 }}>
          <div className="strong small">Contents</div>{toc}
          {view.later.length > 0 && !showLater && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowLater(true)}>{view.later.length} later documents</button>}
        </div></nav>
        <div className="card"><div className="card-b">
          <style>{eyebrowCss}{hideCss}</style>
          {dossier.error ? <ErrorBox message={dossier.error} /> : <DocBody dossier html={dossier.body} />}
          {view.later.length > 0 && !showLater && <div className="callout" style={{ marginTop: 16 }}><b>Phases {view.current + 1} to 12: {view.later.length} more documents open up as you reach them.</b> <span className="muted">Nothing is lost: they fill in as you answer questions.</span> <button className="btn sm" onClick={() => setShowLater(true)}>Show them now</button></div>}
        </div></div>
      </div>
      {adding && <RecordForm pid={pid} typeDef={types[adding]} onCancel={() => setAdding(null)} onDone={() => { setAdding(null); sheet.reload(); docs.reload(); dossier.reload(); }} />}
    </div>
  );
}
