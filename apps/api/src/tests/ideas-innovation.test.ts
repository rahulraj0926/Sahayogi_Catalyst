/* The innovation step: draft, competitors proved by a (fake) checker, the door, and what the CEO's acceptance carries over. No database, no network.
   Run: npx ts-node --transpile-only src/tests/ideas-innovation.test.ts */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { IdeasService } from '../ideas/ideas.service';
import { MAX_COMPETITORS, MIN_COMPETITORS } from '../ideas/innovation';
import { UrlChecker, type UrlCheckResult } from '../ideas/url-checker';
import { HomeService } from '../home/home.service';
import { done, MemoryActivitySource, MemoryPortfolioSource, ok } from './helpers';

/** Answers from a table, and remembers what it was asked. Anything not in the table does not answer. */
class FakeChecker extends UrlChecker {
  asked: string[] = [];
  answers = new Map<string, UrlCheckResult>();
  async check(url: string): Promise<UrlCheckResult> {
    this.asked.push(url);
    return this.answers.get(url) ?? { ok: false, reason: 'unreachable' };
  }
  site(url: string, status = 200, title: string | null = 'A real page', finalUrl = url) { this.answers.set(url, { ok: true, status, finalUrl, title }); }
}

const status = (fn: () => Promise<unknown>) => fn().then(() => 0, (e: any) => ({ status: e.getStatus?.(), body: e.getResponse?.() }));

async function main() {
  const src = new MemoryPortfolioSource();
  const checker = new FakeChecker();
  const svc = new IdeasService(src, checker);
  const pf = src.get();
  const seededWaiting = svc.openCount();

  await ok('a pitch with draft: true starts in innovation, with an empty case and what is missing', async () => {
    const idea = await svc.submit({ one_liner: 'A WhatsApp helper for tax notices', kind: 'software', draft: true }, 'Asha');
    assert.equal(idea.status, 'innovation');
    assert.equal(idea.requester, 'Asha');
    assert.deepEqual([idea.problem, idea.who_for, idea.demo_url], [null, null, null]);
    assert.deepEqual(idea.competitors, []);
    assert.deepEqual(idea.door, { problem: false, who_for: false, competitors: { have: 0, need: MIN_COMPETITORS }, ready: false });
    assert.equal(MIN_COMPETITORS, 3);
  });

  await ok('the old way still works: no draft means it goes straight to the CEO and has no door', async () => {
    const idea = await svc.submit({ one_liner: 'An idea from the old form' }, 'Ravi');
    assert.equal(idea.status, 'new');
    assert.equal(idea.door, null);
    assert.deepEqual(idea.competitors, []);
    assert.equal(svc.openCount(), seededWaiting + 1);
  });

  const draft = svc.list(['innovation'])[0];

  await ok('drafts are not in the CEO inbox, not in the count, not in the Home KPI, and not in the calendar', async () => {
    assert.ok(!svc.list().some((i) => i.status === 'innovation'));
    assert.equal(svc.list().length, svc.openCount());
    assert.equal(svc.list(['innovation']).length, 1);
    assert.equal(svc.list(['innovation'])[0].id, draft.id);
    const home = new HomeService(src, new MemoryActivitySource(src), svc);
    const kpis = (await home.kpis()).kpis;
    assert.equal(kpis.find((k) => k.key === 'ideas_pending')?.value, svc.openCount());
    const cal = home.calendar('2026-10-01', '2026-10-31');
    assert.ok(!JSON.stringify(cal).includes(draft.one_liner));
  });

  await ok('GET one idea: found by id, 404 when unknown', async () => {
    assert.equal(svc.get(draft.id).one_liner, draft.one_liner);
    assert.deepEqual(await status(async () => svc.get('IDEA-999')), { status: 404, body: { code: 'idea_not_found', message: 'There is no idea IDEA-999.' } });
  });

  await ok('only the person who pitched it can change a draft (names compared without case or spaces); everyone else gets 403', async () => {
    const edited = await svc.updateInnovation(draft.id, { problem: 'Small shop owners cannot read tax notices.', who_for: 'Small shop owners' }, '  asha ');
    assert.equal(edited.problem, 'Small shop owners cannot read tax notices.');
    assert.equal(edited.who_for, 'Small shop owners');
    for (const stranger of ['Ravi', 'Founder', '']) {
      assert.equal((await status(() => svc.updateInnovation(draft.id, { problem: 'x'.repeat(20) }, stranger)) as any).body.code, 'not_your_idea');
      assert.equal((await status(() => svc.addCompetitor(draft.id, { name: 'Acme', website: 'acme.com' }, stranger)) as any).status, 403);
      assert.equal((await status(() => svc.removeCompetitor(draft.id, 'CMP-1', stranger)) as any).status, 403);
      assert.equal((await status(() => svc.send(draft.id, stranger)) as any).status, 403);
    }
  });

  await ok('the demo link is cleaned, can be cleared, and a link that is not http or https is refused', async () => {
    assert.equal((await svc.updateInnovation(draft.id, { demo_url: 'figma.com/proto/abc#x' }, 'Asha')).demo_url, 'https://figma.com/proto/abc');
    assert.equal((await svc.updateInnovation(draft.id, { demo_url: null }, 'Asha')).demo_url, null);
    assert.equal((await svc.updateInnovation(draft.id, { demo_url: 'https://figma.com/x' }, 'Asha')).demo_url, 'https://figma.com/x');
    assert.equal((await svc.updateInnovation(draft.id, { demo_url: '' }, 'Asha')).demo_url, null);
    assert.equal(((await status(() => svc.updateInnovation(draft.id, { demo_url: 'javascript:alert(1)' }, 'Asha'))) as any).body.code, 'demo_url_invalid');
  });

  await ok('a competitor is stored only after its website answered; the address is cleaned and the check result is kept', async () => {
    checker.site('https://acme.com/', 200, 'Acme Billing');
    const c = await svc.addCompetitor(draft.id, { name: 'Acme Billing', website: ' Acme.com#top ', note: 'Invoices for shops', demo_url: 'acme.com/demo' }, 'Asha');
    assert.equal(c.id, 'CMP-1');
    assert.equal(c.website, 'https://acme.com/');
    assert.equal(c.note, 'Invoices for shops');
    assert.equal(c.demo_url, 'https://acme.com/demo');
    assert.deepEqual({ ...c.check, checked_at: undefined }, { status: 'verified', http_status: 200, title: 'Acme Billing', final_url: 'https://acme.com/', checked_at: undefined });
    assert.match(c.check.checked_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(checker.asked, ['https://acme.com/']);
    assert.equal(svc.get(draft.id).competitors.length, 1);
  });

  await ok('a site that blocks automated visits (403) is real: kept as "responded"; a 5xx or no answer is not kept', async () => {
    checker.site('https://blocky.example.com/', 403, null);
    const c = await svc.addCompetitor(draft.id, { name: 'Blocky', website: 'blocky.example.com' }, 'Asha');
    assert.equal(c.check.status, 'responded');
    assert.equal(c.check.http_status, 403);
    assert.equal(c.id, 'CMP-2');
    checker.site('https://broken.example.com/', 503, null);
    const before = svc.get(draft.id).competitors.length;
    assert.equal((await status(() => svc.addCompetitor(draft.id, { name: 'Broken', website: 'broken.example.com' }, 'Asha')) as any).body.code, 'competitor_unreachable');
    const missing = (await status(() => svc.addCompetitor(draft.id, { name: 'Ghost', website: 'ghost-company-that-is-not-there.com' }, 'Asha'))) as any;
    assert.equal(missing.status, 422);
    assert.equal(missing.body.code, 'competitor_unreachable');
    assert.equal(svc.get(draft.id).competitors.length, before, 'nothing unreachable is stored');
    // a real site with a page that is not there (404 or 410) is most likely a mistyped address: not kept either
    checker.site('https://typo.example.com/', 404, 'Page Not Found');
    const gone = (await status(() => svc.addCompetitor(draft.id, { name: 'Typo', website: 'typo.example.com' }, 'Asha'))) as any;
    assert.equal(gone.status, 422);
    assert.equal(gone.body.code, 'competitor_unreachable');
    assert.equal(svc.get(draft.id).competitors.length, before, 'a page that was not found is not stored');
  });

  await ok('an address that is not a public website is refused before anything is opened', async () => {
    const asked = checker.asked.length;
    for (const site of ['localhost', 'http://127.0.0.1/admin', 'http://10.0.0.7', 'https://intranet', 'ftp://files.acme.com', 'https://acme.com:8443', 'https://u:p@acme.com', 'http://169.254.169.254/latest/meta-data']) {
      const r = (await status(() => svc.addCompetitor(draft.id, { name: 'Local thing', website: site }, 'Asha'))) as any;
      assert.equal(r.status, 422, site);
      assert.equal(r.body.code, 'competitor_unsafe_address', site);
    }
    assert.equal(checker.asked.length, asked, 'the checker was never asked about them');
    assert.equal(((await status(() => svc.addCompetitor(draft.id, { name: 'Words', website: 'hello world' }, 'Asha'))) as any).body.code, 'competitor_bad_address');
  });

  await ok('the checker saying "unsafe" (for example after a redirect to a private address) is refused too', async () => {
    checker.answers.set('https://sneaky.example.com/', { ok: false, reason: 'unsafe' });
    assert.equal(((await status(() => svc.addCompetitor(draft.id, { name: 'Sneaky', website: 'sneaky.example.com' }, 'Asha'))) as any).body.code, 'competitor_unsafe_address');
  });

  await ok('the same company cannot be listed twice: by host (with or without www) or by where it redirects to', async () => {
    for (const site of ['https://www.acme.com', 'http://ACME.com/pricing']) {
      const r = (await status(() => svc.addCompetitor(draft.id, { name: 'Acme again', website: site }, 'Asha'))) as any;
      assert.equal(r.status, 409, site);
      assert.equal(r.body.code, 'competitor_duplicate');
    }
    checker.site('https://acme-short.example.com/', 200, 'Acme Billing', 'https://www.acme.com/home');
    assert.equal(((await status(() => svc.addCompetitor(draft.id, { name: 'Acme short link', website: 'acme-short.example.com' }, 'Asha'))) as any).status, 409);
  });

  await ok('a competitor can be removed; ids are never given again; removing an unknown one is 404', async () => {
    checker.site('https://third.example.com/', 200, 'Third');
    const third = await svc.addCompetitor(draft.id, { name: 'Third', website: 'third.example.com' }, 'Asha');
    assert.equal(third.id, 'CMP-3');
    const after = await svc.removeCompetitor(draft.id, 'CMP-2', 'Asha');
    assert.deepEqual(after.competitors.map((c) => c.id), ['CMP-1', 'CMP-3']);
    checker.site('https://fourth.example.com/', 200, 'Fourth');
    assert.equal((await svc.addCompetitor(draft.id, { name: 'Fourth', website: 'fourth.example.com' }, 'Asha')).id, 'CMP-4');
    assert.equal(((await status(() => svc.removeCompetitor(draft.id, 'CMP-2', 'Asha'))) as any).body.code, 'competitor_not_found');
    await svc.removeCompetitor(draft.id, 'CMP-4', 'Asha');
  });

  await ok('the door: not ready until the problem, who it is for and three real competitors are in; send is refused with the door as details', async () => {
    const now = svc.get(draft.id);
    assert.deepEqual(now.door, { problem: true, who_for: true, competitors: { have: 2, need: 3 }, ready: false });
    const r = (await status(() => svc.send(draft.id, 'Asha'))) as any;
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'innovation_not_ready');
    assert.deepEqual(r.body.details.door, now.door);
    assert.equal(svc.get(draft.id).status, 'innovation');
    await svc.updateInnovation(draft.id, { problem: 'too short' }, 'Asha');
    assert.equal(svc.get(draft.id).door?.problem, false, 'a problem under 10 characters does not count');
    await svc.updateInnovation(draft.id, { problem: 'Small shop owners cannot read tax notices.' }, 'Asha');
  });

  await ok('the list stops at 12 competitors', async () => {
    const other = await svc.submit({ one_liner: 'Another idea with many rivals', draft: true }, 'Meera');
    for (let k = 0; k < MAX_COMPETITORS; k++) {
      checker.site(`https://rival${k}.example.com/`);
      await svc.addCompetitor(other.id, { name: `Rival ${k}`, website: `rival${k}.example.com` }, 'Meera');
    }
    checker.site('https://rival-last.example.com/');
    assert.equal(((await status(() => svc.addCompetitor(other.id, { name: 'One too many', website: 'rival-last.example.com' }, 'Meera'))) as any).body.code, 'too_many_competitors');
    assert.equal(svc.get(other.id).competitors.length, 12);
  });

  await ok('the CEO cannot accept, reject or shortlist a draft that has not been sent', async () => {
    for (const act of [() => svc.accept(draft.id, {}, 'Founder'), () => svc.reject(draft.id, 'not now', 'Founder'), () => svc.shortlist(draft.id, true, 'Founder')]) {
      const r = (await status(act)) as any;
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'idea_not_sent');
    }
  });

  await ok('send: with the case complete the idea leaves innovation, waits for the CEO and keeps its date; after that it can no longer be edited', async () => {
    checker.site('https://acme.com/', 200, 'Acme Billing');
    await svc.addCompetitor(draft.id, { name: 'Fourth', website: 'fourth.example.com' }, 'Asha');
    assert.equal(svc.get(draft.id).door?.ready, true, 'three real competitors are enough');
    await svc.addCompetitor(draft.id, { name: 'Blocky', website: 'blocky.example.com' }, 'Asha'); // a site that blocks automated visits, kept as "responded"
    const created = svc.get(draft.id).created_on;
    const sent = await svc.send(draft.id, 'Asha');
    assert.equal(sent.status, 'new');
    assert.equal(sent.door, null);
    assert.equal(sent.created_on, created);
    assert.ok(svc.list().some((i) => i.id === draft.id), 'now in the CEO inbox');
    assert.equal(svc.openCount(), seededWaiting + 2);
    assert.equal(((await status(() => svc.updateInnovation(draft.id, { problem: 'changed after sending' }, 'Asha'))) as any).body.code, 'idea_not_in_innovation');
    assert.equal(((await status(() => svc.send(draft.id, 'Asha'))) as any).status, 409);
    assert.equal(((await status(() => svc.addCompetitor(draft.id, { name: 'Late', website: 'late.example.com' }, 'Asha'))) as any).status, 409);
  });

  await ok('accepting carries the case over: the problem, who it is for, and every rival checked, with their date and result', async () => {
    const r = await svc.accept(draft.id, {}, 'Founder');
    assert.equal(r.idea.status, 'promoted');
    assert.equal(r.idea.competitors.length, 4, 'the idea keeps its competitors');
    const store = pf.store(r.productId) as unknown as { all(): any[] };
    const brief = store.all().find((x) => x.type === 'IntakeBrief');
    assert.ok(brief, 'an intake brief was created');
    assert.equal(brief.problem_statement, 'Small shop owners cannot read tax notices.');
    assert.match(brief.idea, /Rivals checked before the CEO decision:/);
    assert.match(brief.idea, /- Acme Billing, https:\/\/acme\.com\/, checked on \d{4}-\d{2}-\d{2} \(verified\), demo: https:\/\/acme\.com\/demo/);
    assert.match(brief.idea, /- Blocky, https:\/\/blocky\.example\.com\/, checked on \d{4}-\d{2}-\d{2} \(site responded\)/);
    assert.deepEqual(brief.reference_products, ['Acme Billing (https://acme.com/)', 'Third (https://third.example.com/)', 'Fourth (https://fourth.example.com/)', 'Blocky (https://blocky.example.com/)']);
    const entry = pf.get(r.productId) as unknown as { idea?: { who_for?: string; asked_by?: string } };
    assert.equal(entry.idea?.who_for, 'Small shop owners');
    assert.equal(entry.idea?.asked_by, 'Asha');
    assert.equal((entry as unknown as { owner: string }).owner, 'Asha');
  });

  await ok('an idea pitched the old way (no case) is accepted exactly as before: its text becomes the problem statement', async () => {
    const old = svc.list().find((i) => i.requester === 'Ravi')!;
    const r = await svc.accept(old.id, { name: 'Old form product' }, 'Founder');
    const brief = (pf.store(r.productId) as unknown as { all(): any[] }).all().find((x) => x.type === 'IntakeBrief');
    assert.equal(brief.problem_statement, 'An idea from the old form');
    assert.ok(!/Rivals checked/.test(brief.idea));
    assert.equal(brief.reference_products, undefined);
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
