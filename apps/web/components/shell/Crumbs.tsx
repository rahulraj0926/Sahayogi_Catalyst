'use client';
import { useRouter } from 'next/navigation';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs';
import { useApi } from '@/lib/api';
import { PHASE_SHORT, screenLabel, sectionFor } from './groups';
import { ProductSwitcher } from './ProductSwitcher';

const TOP: Record<string, string> = { tasks: 'Tasks', notes: 'Notes', approvals: 'Approvals', members: 'Members', reports: 'Reports', help: 'How to use', 'api-docs': 'API docs' };
const COMPETITOR_VIEW: Record<string, string> = { list: 'Competitors', plans: 'Plans', planner: 'Our plans', grid: 'Competitors', catalog: 'Match feature names', prices: 'Prices', compare: 'Compare', sources: 'Sources', queue: 'Review queue', effort: 'Effort' };
const NAMED = new Set(Object.keys(COMPETITOR_VIEW));

/** The trail above a page: Home › Products › <product> › <section> › <page>. Built from the address, so every screen has one without doing anything itself. */
export function crumbsFor(path: string, productName: string | undefined, competitorName: string | undefined): BreadcrumbItem[] {
  const seg = path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  if (seg.length === 0) return [];
  const home: BreadcrumbItem = { label: 'Home', href: '/' };
  if (seg[0] !== 'products') return [home, { label: TOP[seg[0]] || seg[0] }];
  const out: BreadcrumbItem[] = [home, { label: 'Products', href: seg.length > 1 ? '/products' : undefined }];
  if (seg.length === 1) return out;
  const pid = seg[1]; const base = `/products/${encodeURIComponent(pid)}`;
  const rest = seg.slice(2);
  out.push({ label: productName || pid, href: rest.length ? base : undefined });
  if (rest.length === 0) return out;
  if (rest[0] === 'competitors') {
    const cb = `${base}/competitors`;
    if (rest.length === 1) { out.push({ label: 'Competitors' }); return out; }
    out.push({ label: 'Competitors', href: cb });
    if (NAMED.has(rest[1])) out.push({ label: COMPETITOR_VIEW[rest[1]] });
    else out.push({ label: competitorName || rest[1] });
    return out;
  }
  const id = rest[0];
  if (id === 'overview') { out.push({ label: 'Dashboard' }); return out; }
  if (id === 'phase') {
    out.push({ label: 'Phases' });
    out.push({ label: rest[1] !== undefined && PHASE_SHORT[Number(rest[1])] ? `Phase ${rest[1]}: ${PHASE_SHORT[Number(rest[1])]}` : 'Phase' });
    return out;
  }
  const sec = sectionFor(id);
  const first = sec.firstId === 'overview' ? base : `${base}/${sec.firstId}`;
  const page = screenLabel(id);
  const deep = rest.length > 1;
  out.push({ label: sec.label, href: sec.label === page && !deep ? undefined : first });
  if (sec.label !== page || deep) out.push({ label: page, href: deep ? `${base}/${id}` : undefined });
  if (deep) out.push({ label: id === 'documents' || id === 'doc' ? rest[1].replace(/[-_]/g, ' ') : id === 'item' ? rest[1] : id === 'files' ? 'File' : rest[1] });
  return out;
}

export function Crumbs({ path, productName }: { path: string; productName?: string }) {
  const router = useRouter();
  const seg = path.split('/').filter(Boolean);
  const pid = seg[0] === 'products' ? seg[1] : undefined;
  const compId = pid && seg[2] === 'competitors' && seg[3] && !NAMED.has(seg[3]) ? seg[3] : null;
  const item = useApi<any>(compId ? `/items/${compId}` : null, pid);
  const d = item.data;
  const items = crumbsFor(path, productName, d?.item?.title ?? d?.title ?? d?.fields?.title ?? undefined);
  // the product's name in the trail switches to another product, from any page that depends on the product
  const pf = useApi<any>(pid ? '/portfolio' : null);
  const prods: any[] = pf.data?.products || [];
  if (pid && prods.length > 1 && items[2]) {
    items[2] = { ...items[2], render: <ProductSwitcher compact current={items.length === 3} name={items[2].label} pid={pid} path={path} items={prods.map((p: any) => ({ slug: p.slug || p.id, name: p.name, readiness: p.readiness_percent }))} /> };
  }
  if (items.length < 2) return null;
  // Back goes to the page the person came from; opened straight from a link, it goes one step up the trail instead
  const parent = [...items].slice(0, -1).reverse().find((i) => i.href)?.href;
  const back = () => { if (window.history.length > 1) router.back(); else if (parent) router.push(parent); };
  return <Breadcrumbs items={items} onBackAction={back} className="mb-3 shrink-0 text-sm" />;
}
