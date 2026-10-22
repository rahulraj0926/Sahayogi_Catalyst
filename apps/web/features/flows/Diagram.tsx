'use client';
/** Layered flow diagram drawn as SVG from the engine's steps + edges (GET /api/flows/:id). */
export default function FlowDiagram({ steps, edges }: { steps: any[]; edges: any[] }) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const start = steps.find((s) => s.kind === 'start') || steps[0];
  const depth = new Map<string, number>();
  const queue: string[] = start ? [start.id] : [];
  if (start) depth.set(start.id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges.filter((x) => x.from === id)) if (!depth.has(e.to)) { depth.set(e.to, depth.get(id)! + 1); queue.push(e.to); }
  }
  let extra = Math.max(0, ...Array.from(depth.values())) + 1;
  steps.forEach((s) => { if (!depth.has(s.id)) depth.set(s.id, extra++); });
  const cols = new Map<number, string[]>();
  steps.forEach((s) => { const d = depth.get(s.id)!; cols.set(d, [...(cols.get(d) || []), s.id]); });
  const W = 168, H = 54, GX = 52, GY = 26;
  const maxRows = Math.max(...Array.from(cols.values()).map((c) => c.length));
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((ids, d) => ids.forEach((id, i) => pos.set(id, { x: 12 + d * (W + GX), y: 12 + i * (H + GY) + ((maxRows - ids.length) * (H + GY)) / 2 })));
  const width = 24 + cols.size * (W + GX), height = 24 + maxRows * (H + GY);
  const fill = (k: string) => (k === 'start' ? 'var(--ok-bg)' : k === 'end' || k === 'stopped' ? 'var(--neutral-bg)' : k === 'decision' ? 'var(--warn-bg)' : 'var(--panel)');
  const wrap = (t: string) => { const w = String(t).split(' '); const lines: string[] = ['']; w.forEach((x) => { const l = lines[lines.length - 1]; if ((l + ' ' + x).length > 24) lines.push(x); else lines[lines.length - 1] = (l + ' ' + x).trim(); }); return lines.slice(0, 3); };
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)' }}>
      <svg width={width} height={height} role="img" aria-label="Flow diagram">
        <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--sd-muted)" /></marker></defs>
        {edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null;
          const back = b.x <= a.x;
          const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
          const d = back ? `M ${a.x + W / 2} ${a.y + H} C ${a.x + W / 2} ${a.y + H + 40}, ${b.x + W / 2} ${b.y + H + 40}, ${b.x + W / 2} ${b.y + H}` : `M ${x1} ${y1} C ${x1 + GX / 2} ${y1}, ${x2 - GX / 2} ${y2}, ${x2} ${y2}`;
          return <g key={e.id}><path d={d} fill="none" stroke={e.kind === 'happy' ? 'var(--sd-muted)' : 'var(--bad)'} strokeDasharray={e.kind === 'happy' ? undefined : '5 4'} markerEnd="url(#arr)" />{e.condition && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize="10" fill="var(--ink-2)" textAnchor="middle">{String(e.condition).slice(0, 22)}</text>}</g>;
        })}
        {steps.map((s) => { const p = pos.get(s.id)!; const L = wrap(s.title); return (
          <g key={s.id}><rect x={p.x} y={p.y} width={W} height={H} rx={s.kind === 'decision' ? 20 : 8} fill={fill(s.kind)} stroke="var(--line-2)" />
            {L.map((l, i) => <text key={i} x={p.x + W / 2} y={p.y + 20 + i * 13 - (L.length - 1) * 4} fontSize="11.5" fill="var(--ink)" textAnchor="middle">{l}</text>)}
            <text x={p.x + 6} y={p.y + H - 5} fontSize="9" fill="var(--sd-muted)">{s.id}</text></g>); })}
      </svg>
    </div>
  );
}
