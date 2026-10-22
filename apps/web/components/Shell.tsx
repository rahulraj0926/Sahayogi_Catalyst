'use client';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { actor, useApi } from '@/lib/api';
import { Rail } from './shell/Rail';
import { Drawer } from './shell/Drawer';
import { Header } from './shell/Header';
import { NamePrompt } from './shell/NamePrompt';
import { useAssistant } from './shell/AssistantHost';
import { competitorGroups, isCompetitorsPath, productGroups } from './shell/groups';
import { Tour } from './tour/Tour';
import { Crumbs } from './shell/Crumbs';

export { PHASE_SHORT } from './shell/groups';

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const pid = /^\/products\/([^/]+)/.exec(path)?.[1];
  const { data: pf } = useApi<any>('/portfolio');
  const inbox = useApi<any>(pid ? '/inbox?status=proposed' : null, pid);
  const appr = useApi<any>(pid ? '/approvals' : null, pid);
  const cur = pf?.products?.find((p: any) => p.id === pid || p.slug === pid);
  const counts = { inbox: inbox.data?.counts?.proposed || 0, approvals: (appr.data?.for_you?.length || 0) + (appr.data?.waiting?.length || 0), people: 0 };
  counts.people = counts.inbox + counts.approvals;
  const [who, setWho] = useState('');
  useEffect(() => setWho(actor()), []);
  const groups = useMemo(() => (pid ? (isCompetitorsPath(path) ? competitorGroups(pid) : productGroups(pid, cur?.mode)) : []), [pid, cur?.mode, path]);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [sbw, setSbw] = useState(0); // width of the page scrollbar, so the header ends exactly where the page content ends
  useEffect(() => { const el = mainRef.current; if (!el) return; const m = () => setSbw(el.offsetWidth - el.clientWidth); m(); const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect(); }, [pid]);
  useEffect(() => { setMenuOpen(false); }, [path]);
  const ai = useAssistant(pid);
  const life = useApi<any>(pid ? '/lifecycle' : null, pid); // each phase's weighted completion, shown beside the phase in the menu
  const percents: number[] | undefined = life.data?.phases?.map((p: any) => p.percent);
  const product = cur ? { name: cur.name, stageLabel: cur.stage_label, readinessPercent: cur.readiness_percent, phase: /^P(\d+)/.test(String(cur.stage ?? '')) ? Number(/^P(\d+)/.exec(String(cur.stage))![1]) : /^(handoff|done)$/.test(String(cur.stage ?? '')) ? 5 : undefined } : null;

  return (
    <div className="workspace-root [--page-pad-x:0.75rem] screen-sm:[--page-pad-x:1.125rem] flex h-dvh w-full flex-col overflow-hidden bg-[var(--shell-bg)] text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Rail path={path} />
        <div className={`flex min-w-0 flex-col overflow-hidden transition-[flex-grow,opacity] duration-300 ease-out ${ai.mode === 'fullscreen' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          inert={ai.mode === 'fullscreen' ? true : undefined} style={{ flexGrow: ai.mode === 'fullscreen' ? 0 : 1, flexBasis: 0 }}>
          <Header edge={sbw} pid={pid} who={who} onWho={setWho} approvals={counts.approvals} onMenu={pid ? () => setMenuOpen((o) => !o) : undefined} />
          <div className="relative flex min-h-0 flex-1">
            {pid && <Drawer product={product} groups={groups} path={path} counts={counts} percents={percents} open={menuOpen} onClose={() => setMenuOpen(false)} />}
            <main className="no-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-auto px-[var(--page-pad-x)] pb-20 pt-[var(--page-pad-y)] [scrollbar-gutter:stable] screen-sm:pb-[var(--page-pad-y)]" ref={mainRef}>
              <Crumbs path={path} productName={cur?.name} />
              <div className="w-full min-w-0 flex-1 page-transition" key={path}><div className="main">{children}</div></div>
              <footer className="shrink-0 py-3 text-xs text-[var(--text-muted)]">
                Every number is computed from the saved records. Nothing is typed in twice.
              </footer>
            </main>
          </div>
        </div>
        {ai.region}
      </div>
      {ai.button}
      <NamePrompt onName={setWho} />
      <Tour />
    </div>
  );
}
