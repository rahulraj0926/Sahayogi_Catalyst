/**
 * engine/compose_p1.ts - Phase 1 documents: Market Analysis, Competitor Analysis, Customer Context, Problem Landscape, Market Risks.
 */
import * as K from './compose_kit';
import * as gates from './gates';
import * as competitors from './competitors';
import * as freshness from './freshness';
import * as plain from './plain';

const { p, note, tableOf, table, sec, need, needCount, target, clip, plural, andList, countBy, countsText } = K;

const marketAnalysis = {
  key: 'market_analysis', title: 'Market Analysis', phase: 1, role: 'Product Owner', artifact: 'market_analysis',
  reads: ['Segment', 'Persona', 'Job', 'Competitor', 'Opportunity', 'Problem', 'Obligation', 'Risk'],
  build(k) {
    const seg = k.list('Segment'); const opp = k.list('Opportunity'); const obl = k.list('Obligation'); const comp = k.list('Competitor');
    const risks = k.list('Risk', (r) => r.category === 'market');
    return [
      sec('segments', 'Who the market is', [
        seg.length ? p(`${plural(seg.length, 'customer group')} ${seg.length === 1 ? 'is' : 'are'} defined${seg.some((s) => s.primary) ? `; the primary one is ${andList(seg.filter((s) => s.primary).map((s) => `[[${s.id}]] ${s.title}`))}` : ''}.${seg.filter((s) => s.size_count).map((s) => ` [[${s.id}]] is sized at ${s.size_count} accounts.`).join('')}`) : p('No segments are defined yet.'),
        seg.length && tableOf(seg, [['ID', (s) => `[[${s.id}]]`], ['Segment', (s) => s.title], ['Definition', (s) => clip(s.definition, 140)], ['Primary', (s) => (s.primary ? 'yes' : '')], ['Size (accounts)', (s) => s.size_count], ['Average income per account (INR a month)', (s) => s.arpa], ['Status', (s) => s.status]]),
      ], [need(seg.some((s) => s.primary), 'A main customer group', 'The Stage 1 sign-off needs the main customer group described.', target({ request: 'DR-1-01' }))]),
      sec('landscape', 'Competitive landscape in brief', [
        comp.length ? p(`${plural(comp.length, 'competitor or alternative', 'competitors or alternatives')} ${comp.length === 1 ? 'is' : 'are'} tracked: ${plain.tierCounts(comp)}. The Competitor Analysis document has the detail.`) : p('No competitors are tracked yet.'),
        comp.length && tableOf(comp, [['ID', (c) => `[[${c.id}]]`], ['Name', (c) => c.title], ['Kind', (c) => plain.word('competitor_kind', c.kind)], ['How serious a rival', (c) => plain.TIER_WORDS[c.tier] || 'Not yet sorted'], ['Positioning', (c) => clip(c.positioning, 100)]]),
      ], [needCount(comp, (gates.config().params.min_competitors || {})[gates.depthOf(k.store)] || 2, 'The minimum number of competitors for this level of thoroughness', 'The Stage 1 sign-off needs enough competitors studied.', target({ request: 'DR-1-03' }))]),
      sec('opps', 'Opportunities', [
        opp.length ? p(`${plural(opp.length, 'opportunity')} are recorded.`) : p('No opportunities are recorded yet.'),
        opp.length && tableOf(opp, [['ID', (o) => `[[${o.id}]]`], ['Opportunity', (o) => clip(o.statement || o.title, 140)], ['Problem it solves', (o) => k.out(o.id, 'addresses').map((x) => x.title).join('; ')], ['Competitor gap it uses', (o) => k.out(o.id, 'exploits').map((x) => x.title).join('; ')], ['Status', (o) => o.status]]),
      ], [needCount(opp, 1, 'At least one opportunity', 'An analysis with no opportunity gives the product no reason to exist.', target({ request: 'DR-1-08' }))]),
      sec('regs', 'Regulation and standards', [
        obl.length ? p(`${plural(obl.length, 'law or standard', 'laws or standards')} ${obl.length === 1 ? 'applies or was' : 'apply or were'} checked.`) : p('No laws or standards have been scanned yet.'),
        obl.length && tableOf(obl, [['ID', (o) => `[[${o.id}]]`], ['Law or standard', (o) => o.instrument || o.title], ['Kind', (o) => o.kind], ['Does it apply?', (o) => o.applicability], ['Status', (o) => o.status]]),
      ], [needCount(obl, 1, 'At least one law or standard checked', 'The Stage 1 sign-off needs the legal and rules check done.', target({ request: 'DR-1-17' }))]),
      sec('risks', 'Market risks', [risks.length ? p(`${plural(risks.length, 'market risk')}: ${andList(risks.map((r) => `"${clip(r.title, 70)}"`))}. The Market Risks document has the detail.`) : p('No market risks recorded.')], [needCount(risks, 1, 'At least one market risk', 'The Stage 1 sign-off needs market risks written down.', target({ request: 'DR-1-06' }))]),
    ];
  },
};

const competitorAnalysis = {
  key: 'competitor_analysis', title: 'Competitor Analysis', phase: 1, role: 'Product Owner', artifact: 'competitor_analysis',
  reads: ['Competitor', 'CompetitorCapability', 'PricePoint', 'CompetitorNote', 'Evidence', 'TrackedSource'],
  build(k) {
    const store = k.store; const today = store.today();
    const tv = competitors.tierView(store);
    const grid = competitors.grid(store);
    const pr = competitors.prices(store);
    const comps = k.list('Competitor');
    const minC = (gates.config().params.min_competitors || {})[gates.depthOf(store)] || 2;
    const reviewed = comps.filter((c) => c.status === 'Reviewed');
    const staleCount = tv.tiers && Object.values(tv.tiers).flat().reduce((n, r) => n + r.stale, 0);
    const out = [];
    out.push(sec('set', 'Who we compete with', [
      comps.length ? p(`${plural(comps.length, 'competitor or alternative', 'competitors or alternatives')} ${comps.length === 1 ? 'is' : 'are'} tracked (${plain.tierCounts(comps)}); ${reviewed.length} ${reviewed.length === 1 ? 'has' : 'have'} been checked by a person.`) : p('No competitors are tracked yet.'),
      comps.length && tableOf(comps, [['ID', (c) => `[[${c.id}]]`], ['Name', (c) => c.title], ['Kind', (c) => plain.word('competitor_kind', c.kind)], ['How serious a rival', (c) => plain.TIER_WORDS[c.tier] || 'Not yet sorted'], ['Founded', (c) => c.founded_year], ['Based in', (c) => c.hq_country], ['People', (c) => c.size_band], ['Positioning', (c) => clip(c.positioning, 100)], ['Status', (c) => c.status]]),
      ...tv.warnings.map((w) => note(`Warning: ${w}.`)),
    ], [needCount(reviewed, minC, `At least ${minC} competitors checked by a person (have ${reviewed.length})`, 'The Stage 1 sign-off needs enough competitors studied and checked.', target({ request: 'DR-1-03' }))]));
    for (const c of comps.filter((x) => x.strengths || x.weaknesses || x.target_customers || x.funding_summary || x.technology_notes).slice(0, 12)) {
      out.push(sec(`profile-${c.id}`, `Profile: ${c.title}`, [
        c.target_customers && p(`Target customers: ${clip(c.target_customers, 300)}`), c.strengths && p(`Strengths: ${clip(c.strengths, 300)}`), c.weaknesses && p(`Weaknesses: ${clip(c.weaknesses, 300)}`),
        c.funding_summary && p(`Funding: ${clip(c.funding_summary, 200)}`), c.technology_notes && p(`Technology: ${clip(c.technology_notes, 300)}`),
        c.gtm_channels && c.gtm_channels.length && p(`Go-to-market: ${c.gtm_channels.join(', ')}.`), c.key_customers && c.key_customers.length && p(`Known customers: ${c.key_customers.join(', ')}.`),
      ], []));
    }
    out.push(sec('grid', 'Capability comparison', [
      grid.rows.length ? p(`${grid.rows.length} capabilities are compared across ${grid.competitors.length} main competitors, smaller competitors and customer alternatives. Each cell shows how well they do it, how reliable the source is and how recent it is; "unknown" is never counted as zero. ${grid.note}`) : p('No capability cells are recorded yet.'),
      grid.rows.length && table(['Capability', 'Importance', ...grid.competitors.map((c) => c.title)], grid.rows.map((r) => [r.tag, String(r.importance), ...grid.competitors.map((c) => { const x = r.cells[c.id]; return x ? `${x.level}${x.grade ? ` (${x.grade})` : ''} ${x.freshness === 'fresh' ? '' : '[' + x.freshness + ']'}${x.counted ? '' : ' *'}`.trim() : 'not recorded'; })])),
      grid.rows.length && note('* not counted: unverified, not reviewed, or stale.'),
      grid.scores.length && table(['Competitor', 'Score weighted by importance', 'Plain score', 'Capabilities rated', 'Share not known'], grid.scores.map((s) => [`[[${s.id}]]`, s.weighted === null ? '-' : `${s.weighted}%`, s.unweighted === null ? '-' : `${s.unweighted}%`, String(s.rated), `${s.unknownShare}%`])),
    ], [need(tv.counts.total > 0 && grid.rows.length > 0, 'A capability comparison for the main and smaller competitors', 'The Stage 1 sign-off needs it.', target({ request: 'DR-1-14' })), need(!staleCount, `No out-of-date competitor facts (${staleCount || 0} out of date)`, 'Out-of-date facts drop out of the results until they are refreshed.', target({ request: 'DR-1-21' }))]));
    out.push(sec('prices', 'Price comparison', [
      pr.rows.length ? p(`${plural(pr.rows.length, 'price')} ${pr.rows.length === 1 ? 'is' : 'are'} recorded. ${pr.rule}`) : p('No prices are recorded yet.'),
      pr.rows.length && table(['ID', 'Competitor', 'Plan', 'Price', 'Kind of price', 'How it is paid', 'Tax', 'In rupees', 'How recent', 'Counted'], pr.rows.map((r) => [`[[${r.id}]]`, r.competitor ? r.competitor.title : '-', r.plan || '-', `${plain.money(r.amount, r.currency)} ${plain.perUnit(r.unit)}`.trim(), plain.word('price_type', r.price_type), plain.word('billing_model', r.billing_model), plain.word('tax_basis', r.tax_basis), (r.by_volume ? (r.normalised_inr_per_gb === null ? null : `${r.normalised_inr_per_gb} per GB`) : (r.amount_inr === null || r.amount_inr === undefined ? null : String(r.amount_inr))) || '-', plain.word('freshness', r.freshness), r.counted ? 'yes' : 'no'])),
      pr.tco.length ? p('Indicative monthly bill at like-for-like list prices for data delivered (INR): ' + pr.tco.map((t) => `${t.competitor}: small ${t.small}, typical ${t.typical}, large ${t.large}`).join('; ') + '.') : null,
    ], [need(pr.rows.length > 0 || comps.some((c) => c.pricing_na_reason), 'Prices, or a stated reason for none', 'The Stage 1 sign-off needs competitor prices or a reason for none.', target({ request: 'DR-1-15' }))]));
    const notes = k.list('CompetitorNote').sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
    if (notes.length) out.push(sec('notes', 'Recent competitor notes', [tableOf(notes, [['Date', (n) => n.date], ['Competitor', (n) => k.out(n.id, 'note_on').map((c) => `[[${c.id}]] ${c.title}`).join(', ')], ['Note', (n) => clip(n.text, 200)], ['Source', (n) => n.source], ['By', (n) => n.author]])], []));
    return out;
  },
};

const customerContext = {
  key: 'customer_context', title: 'Customer Context', phase: 1, role: 'Product Owner', artifact: null,
  reads: ['Segment', 'Persona', 'Job', 'Insight'],
  build(k) {
    const per = k.list('Persona'); const jobs = k.list('Job').sort((a, b) => (a.rank || 99) - (b.rank || 99)); const seg = k.list('Segment');
    return [
      sec('personas', 'The people', [
        per.length ? p(`${plural(per.length, 'customer profile')} across ${plural(seg.length, 'customer group')}.`) : p('No customer profiles are defined yet.'),
        per.length && tableOf(per, [['ID', (x) => `[[${x.id}]]`], ['Customer profile', (x) => x.title], ['Kind', (x) => plain.word('persona_kind', x.kind)], ['Role in buying', (x) => plain.word('buying_role', x.buying_role)], ['Customer group', (x) => k.out(x.id, 'member_of').map((s) => s.title).join('; ')], ['Goals', (x) => clip(x.goals, 120)], ['Frustrations', (x) => clip(x.frustrations, 100)]]),
      ], [needCount(per, 1, 'At least one customer profile', 'Every story must later serve a kind of customer.', target({ request: 'DR-1-01' })), need(per.every((x) => k.out(x.id, 'member_of').length), 'Every customer profile belongs to a customer group', 'Profiles need a group to belong to.', target({ request: 'DR-1-01' }))]),
      sec('jobs', 'The jobs they are trying to get done', [
        jobs.length ? p(`${plural(jobs.length, 'job')} are ranked; the top job is ${jobs[0] ? `[[${jobs[0].id}]] ${clip(jobs[0].statement, 140)}` : 'not set'}.`) : p('No jobs are recorded yet.'),
        jobs.length && tableOf(jobs, [['Rank', (j) => j.rank], ['ID', (j) => `[[${j.id}]]`], ['Job', (j) => clip(j.statement, 160)], ['Importance', (j) => j.importance], ['Satisfaction today', (j) => j.satisfaction], ['Evidence', (j) => k.out(j.id, 'supported_by').map((e) => `${e.content && e.title.startsWith('Customer voice') ? `"${clip(e.content, 80)}"` : e.title}${e.origin === 'human' && e.provenance && e.provenance.method === 'by_hand' && e.verification !== 'verified' ? ' (not checked by a second person yet)' : ''}`).join('; ') || 'none yet']]),
      ], [needCount(jobs, 3, 'At least three ranked jobs', 'The Stage 1 sign-off needs the top jobs described.', target({ request: 'DR-1-02' })), need(seg.filter((s) => s.primary).every((s) => k.out(s.id, 'supported_by').length >= 2), 'The main customer group is backed by at least two customer quotes', 'The Stage 1 sign-off needs two customer quotes for the main group.', target({ request: 'DR-1-18' })), ...(gates.depthOf(k.store) === 'L3' ? [need(jobs.filter((j) => (j.rank || 99) <= 3).every((j) => k.out(j.id, 'supported_by').length), 'Each of the top jobs cites evidence', 'The Thorough level needs evidence behind the top jobs.', target({ request: 'DR-1-18' }))] : [])]),
    ];
  },
};

const problemLandscape = {
  key: 'problem_landscape', title: 'Problem Landscape', phase: 1, role: 'Product Owner', artifact: null,
  reads: ['Problem', 'Insight', 'Opportunity', 'Evidence'],
  build(k) {
    const pr = k.list('Problem');
    return [
      sec('problems', 'What is going wrong for customers', [
        pr.length ? p(`${plural(pr.length, 'problem')} are recorded${pr.some((x) => x.severity >= 4) ? `; ${pr.filter((x) => x.severity >= 4).length} rated severity 4 or 5` : ''}.`) : p('No problems are recorded yet.'),
        pr.length && tableOf(pr, [['ID', (x) => `[[${x.id}]]`], ['Problem', (x) => clip(x.statement, 150)], ['Severity', (x) => x.severity], ['Frequency', (x) => x.frequency], ['Workaround', (x) => clip(x.current_workaround, 80)], ['Found in', (x) => k.inn(x.id, 'raises').map((i) => i.title).join('; ') || 'no finding yet'], ['Addressed by', (x) => k.inn(x.id, 'addresses').map((i) => i.title).join('; ') || 'nothing yet']]),
      ], [needCount(pr, 1, 'At least one problem', '', target({ request: 'DR-1-22' })), need(pr.every((x) => k.inn(x.id, 'raises').length), 'Every problem traces to a finding', 'A problem with no finding behind it is only an opinion.', target({ request: 'DR-1-22' })), need(pr.every((x) => k.inn(x.id, 'addresses').length), 'Every problem is addressed by an opportunity or feature', 'A problem nobody is addressing is a gap.', target({ request: 'DR-1-08' }))]),
    ];
  },
};

const marketRisks = {
  key: 'market_risks', title: 'Market Risks', phase: 1, role: 'Sponsor', artifact: null,
  reads: ['Risk'],
  build(k) {
    const all = k.list('Risk');
    const mk = all.filter((r) => r.category === 'market');
    return [
      sec('risks', 'What could go wrong in the market', [
        mk.length ? p(`${plural(mk.length, 'market risk')} are recorded; the highest score is ${Math.max(...mk.map((r) => r.score || 0))} of 25.`) : p('No market risks are recorded yet.'),
        mk.length && tableOf(mk.sort((a, b) => (b.score || 0) - (a.score || 0)), [['ID', (r) => `[[${r.id}]]`], ['Risk', (r) => clip(r.title, 120)], ['Effect', (r) => clip(r.effect, 100)], ['Likelihood (1 to 5)', (r) => r.probability], ['Impact (1 to 5)', (r) => r.impact], ['Score', (r) => r.score], ['Owner', (r) => r.owner], ['Status', (r) => r.status], ['Next review', (r) => r.review_date]]),
        all.length > mk.length && note(`${all.length - mk.length} further risks of other categories are in the register.`),
      ], [needCount(mk, 1, 'At least one market risk', 'The Stage 1 sign-off needs market risks written down.', target({ request: 'DR-1-06' })), need(mk.every((r) => r.owner), 'Every market risk has an owner', 'Each risk needs a person who owns it.', target({ request: 'DR-1-06' }))]),
    ];
  },
};

export default [marketAnalysis, competitorAnalysis, customerContext, problemLandscape, marketRisks];
