/**
 * A small in-memory metrics registry that prints the Prometheus text format (GET /metrics). No dependency: counters, histograms and
 * gauges that are read when someone scrapes. One API instance keeps its own numbers (they restart at zero with the process, which
 * Prometheus expects). The number of distinct label sets is capped so a bad label can never grow memory without limit.
 */
type Labels = Record<string, string | number>;
const MAX_SERIES = 3000;
export const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const key = (l: Labels) => Object.keys(l).sort().map((k) => `${k}=${l[k]}`).join('\u0001');
const esc = (v: string | number) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const fmt = (l: Labels) => { const k = Object.keys(l).sort(); return k.length ? '{' + k.map((x) => `${x}="${esc(l[x])}"`).join(',') + '}' : ''; };

export class Metrics {
  private counters = new Map<string, { help: string; series: Map<string, { labels: Labels; v: number }> }>();
  private hists = new Map<string, { help: string; series: Map<string, { labels: Labels; counts: number[]; sum: number; n: number }> }>();
  private gauges = new Map<string, { help: string; read: () => number | Array<{ labels?: Labels; value: number }> }>();
  private size = 0;

  inc(name: string, labels: Labels = {}, by = 1, help = name) {
    const c = this.counters.get(name) || { help, series: new Map() };
    this.counters.set(name, c);
    const k = key(labels);
    let s = c.series.get(k);
    if (!s) { if (this.size >= MAX_SERIES) return; s = { labels, v: 0 }; c.series.set(k, s); this.size++; }
    s.v += by;
  }

  observe(name: string, labels: Labels, seconds: number, help = name) {
    const h = this.hists.get(name) || { help, series: new Map() };
    this.hists.set(name, h);
    const k = key(labels);
    let s = h.series.get(k);
    if (!s) { if (this.size >= MAX_SERIES) return; s = { labels, counts: BUCKETS.map(() => 0), sum: 0, n: 0 }; h.series.set(k, s); this.size++; }
    BUCKETS.forEach((b, i) => { if (seconds <= b) s!.counts[i]++; });
    s.sum += seconds; s.n++;
  }

  gauge(name: string, help: string, read: () => number | Array<{ labels?: Labels; value: number }>) { this.gauges.set(name, { help, read }); }

  render(): string {
    const out: string[] = [];
    for (const [name, c] of this.counters) {
      out.push(`# HELP ${name} ${c.help}`, `# TYPE ${name} counter`);
      for (const s of c.series.values()) out.push(`${name}${fmt(s.labels)} ${s.v}`);
    }
    for (const [name, h] of this.hists) {
      out.push(`# HELP ${name} ${h.help}`, `# TYPE ${name} histogram`);
      for (const s of h.series.values()) {
        BUCKETS.forEach((b, i) => out.push(`${name}_bucket${fmt({ ...s.labels, le: b })} ${s.counts[i]}`));
        out.push(`${name}_bucket${fmt({ ...s.labels, le: '+Inf' })} ${s.n}`, `${name}_sum${fmt(s.labels)} ${s.sum}`, `${name}_count${fmt(s.labels)} ${s.n}`);
      }
    }
    for (const [name, g] of this.gauges) {
      let v: ReturnType<typeof g.read>;
      try { v = g.read(); } catch { continue; }
      out.push(`# HELP ${name} ${g.help}`, `# TYPE ${name} gauge`);
      for (const x of Array.isArray(v) ? v : [{ value: v }]) out.push(`${name}${fmt((x as any).labels || {})} ${(x as any).value}`);
    }
    return out.join('\n') + '\n';
  }
}

/** The one registry the server uses. */
export const metrics = new Metrics();
