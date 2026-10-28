import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PortfolioSource } from '../engine-port/ports';
import type { IdeaCompetitorRecord, IdeaRecord, IdeaStatus } from '../types/legacy';
import type { AcceptIdeaDto, AcceptedIdeaDto, AddCompetitorDto, IdeaCompetitorDto, IdeaDto, SubmitIdeaDto, UpdateInnovationDto } from './dto/ideas.dto';
import { MAX_COMPETITORS, doorOf, hostKey, isPitcher, nextCompetitorId, normaliseLink, normaliseWebsite } from './innovation';
import { SafeUrlChecker, UrlChecker, failed } from './url-checker';

/** Waiting for the CEO. Drafts still in innovation are not here: the CEO does not see them until they are sent. */
export const OPEN_IDEA: IdeaStatus[] = ['new', 'shortlisted'];

const toCompetitor = (c: IdeaCompetitorRecord): IdeaCompetitorDto => ({
  id: c.id, name: c.name, website: c.website, note: c.note ?? null, demo_url: c.demo_url ?? null,
  check: { status: c.check.status, http_status: c.check.http_status, title: c.check.title ?? null, final_url: c.check.final_url, checked_at: c.check.checked_at },
});

const toDto = (i: IdeaRecord): IdeaDto => ({
  id: i.id, one_liner: i.one_liner, text: i.text || '', requester: i.requester, created_on: i.created_on, status: i.status,
  kind: i.kind, product_id: i.product_id, decided_by: i.decided_by, decided_at: i.decided_at, reject_reason: i.reject_reason,
  problem: i.problem || null, who_for: i.who_for || null, demo_url: i.demo_url || null,
  competitors: (i.competitors || []).map(toCompetitor),
  door: i.status === 'innovation' ? doorOf(i) : null,
});

/**
 * Ideas: anyone pitches one. It starts in innovation, where its pitcher fills in the problem, who it is for and a list of real
 * competitors (each website is opened by the server before it is kept). Only then is it sent to the CEO, who accepts it into a
 * product, shortlists it or rejects it with a reason.
 */
@Injectable()
export class IdeasService {
  // the default lets a test build the service with just a portfolio; Nest always injects the checker bound in the module
  constructor(private readonly src: PortfolioSource, private readonly urls: UrlChecker = new SafeUrlChecker()) {}

  list(status?: IdeaStatus[]): IdeaDto[] {
    const all = this.src.get().ideas();
    const wanted = status && status.length ? status : OPEN_IDEA;
    return all.filter((i) => wanted.includes(i.status)).sort((a, b) => b.created_on.localeCompare(a.created_on) || b.id.localeCompare(a.id)).map(toDto);
  }

  /** How many ideas wait for the CEO. A draft in innovation does not count. */
  openCount(): number { return this.src.get().ideas().filter((i) => OPEN_IDEA.includes(i.status)).length; }

  get(id: string): IdeaDto { return toDto(this.find(id)); }

  async submit(dto: SubmitIdeaDto, actor: string): Promise<IdeaDto> {
    const idea = this.src.get().addIdea({ one_liner: dto.one_liner, text: dto.text, kind: dto.kind, requester: actor, draft: dto.draft === true }, actor);
    await this.src.flush();
    return toDto(idea);
  }

  private find(id: string): IdeaRecord {
    try { return this.src.get().idea(id); } catch { throw new NotFoundException({ code: 'idea_not_found', message: `There is no idea ${id}.` }); }
  }

  // ---------------------------------------------------------------- the innovation case (the pitcher's side)

  /** The draft of this idea, for its pitcher only. */
  private draftOf(id: string, actor: string): IdeaRecord {
    const idea = this.find(id);
    if (!isPitcher(idea, actor)) throw new ForbiddenException({ code: 'not_your_idea', message: 'Only the person who pitched this idea can change it.' });
    if (idea.status !== 'innovation') throw new ConflictException({ code: 'idea_not_in_innovation', message: `${idea.id} is no longer in innovation, so it cannot be changed.` });
    return idea;
  }

  async updateInnovation(id: string, dto: UpdateInnovationDto, actor: string): Promise<IdeaDto> {
    const idea = this.draftOf(id, actor);
    if (dto.problem !== undefined) idea.problem = dto.problem;
    if (dto.who_for !== undefined) idea.who_for = dto.who_for;
    if (dto.demo_url !== undefined) {
      const link = normaliseLink(dto.demo_url);
      if (link === undefined) throw new UnprocessableEntityException({ code: 'demo_url_invalid', message: 'The demo link must be a web address such as https://example.com/demo.' });
      if (link === null) delete idea.demo_url; else idea.demo_url = link;
    }
    this.src.get().saveRegistry();
    await this.src.flush();
    return toDto(idea);
  }

  /** Adds one real competitor. The website is opened first; only a site that answered is kept. */
  async addCompetitor(id: string, dto: AddCompetitorDto, actor: string): Promise<IdeaCompetitorDto> {
    const idea = this.draftOf(id, actor);
    const list = idea.competitors || (idea.competitors = []);
    if (list.length >= MAX_COMPETITORS) throw new UnprocessableEntityException({ code: 'too_many_competitors', message: `An idea can list up to ${MAX_COMPETITORS} competitors.` });

    const site = normaliseWebsite(dto.website);
    if (failed(site)) {
      if (site.reason === 'unsafe') throw new UnprocessableEntityException({ code: 'competitor_unsafe_address', message: 'That address cannot be a public website. Use the competitor\'s normal web address, such as https://example.com.' });
      throw new UnprocessableEntityException({ code: 'competitor_bad_address', message: 'That does not look like a website address. Try something like example.com.' });
    }
    if (list.some((c) => hostKey(new URL(c.website).hostname) === hostKey(site.host))) throw new ConflictException({ code: 'competitor_duplicate', message: 'That website is already in the list.' });

    let demo: string | null = null;
    if (dto.demo_url !== undefined && dto.demo_url !== null && dto.demo_url.trim() !== '') {
      const link = normaliseLink(dto.demo_url);
      if (!link) throw new UnprocessableEntityException({ code: 'demo_url_invalid', message: 'The demo link must be a web address such as https://example.com/demo.' });
      demo = link;
    }

    const seen = await this.urls.check(site.url);
    if (failed(seen)) {
      if (seen.reason === 'unsafe') throw new UnprocessableEntityException({ code: 'competitor_unsafe_address', message: 'That address cannot be a public website. Use the competitor\'s normal web address, such as https://example.com.' });
      throw new UnprocessableEntityException({ code: 'competitor_unreachable', message: 'We could not open that website. Check the address and try again.' });
    }
    if (seen.status >= 500 || seen.status < 200) throw new UnprocessableEntityException({ code: 'competitor_unreachable', message: 'That website did not answer properly. Check the address and try again.' });
    // the site exists but this page does not: most likely a mistyped address, so it proves nothing about the competitor
    if (seen.status === 404 || seen.status === 410) throw new UnprocessableEntityException({ code: 'competitor_unreachable', message: 'That page was not found on the website. Check the address and try again.' });

    // sites often redirect to another name: the same company must not be listed twice under two names
    if (list.some((c) => hostKey(new URL(c.check.final_url).hostname) === hostKey(new URL(seen.finalUrl).hostname))) throw new ConflictException({ code: 'competitor_duplicate', message: 'That website is already in the list.' });

    const record: IdeaCompetitorRecord = {
      id: nextCompetitorId(list), name: dto.name, website: site.url, note: dto.note?.trim() ? dto.note : null, demo_url: demo,
      check: { status: seen.status < 400 ? 'verified' : 'responded', http_status: seen.status, title: seen.title, final_url: seen.finalUrl, checked_at: new Date().toISOString() }, // the real time of the check: the portfolio clock can be pinned to a demo date
    };
    list.push(record);
    const pf = this.src.get();
    pf.saveRegistry();
    pf.systemEvent('idea.competitor_added', idea.id, actor, `${actor} added ${record.name} (${new URL(record.website).hostname}) to the competitors of ${idea.id}`);
    await this.src.flush();
    return toCompetitor(record);
  }

  async removeCompetitor(id: string, competitorId: string, actor: string): Promise<IdeaDto> {
    const idea = this.draftOf(id, actor);
    const at = (idea.competitors || []).findIndex((c) => c.id === competitorId);
    if (at < 0) throw new NotFoundException({ code: 'competitor_not_found', message: `${idea.id} has no competitor ${competitorId}.` });
    const [gone] = idea.competitors!.splice(at, 1);
    if (!idea.competitors!.length) delete idea.competitors;
    const pf = this.src.get();
    pf.saveRegistry();
    pf.systemEvent('idea.competitor_removed', idea.id, actor, `${actor} removed ${gone.name} from the competitors of ${idea.id}`);
    await this.src.flush();
    return toDto(idea);
  }

  /** The draft is complete: it leaves innovation and waits for the CEO. */
  async send(id: string, actor: string): Promise<IdeaDto> {
    const idea = this.draftOf(id, actor);
    const door = doorOf(idea);
    if (!door.ready) throw new UnprocessableEntityException({ code: 'innovation_not_ready', message: 'The idea is not ready to go to the CEO yet.', details: { door } });
    idea.status = 'new';
    const pf = this.src.get();
    pf.saveRegistry();
    pf.systemEvent('idea.sent', idea.id, actor, `${actor} sent idea ${idea.id} to the CEO with ${door.competitors.have} competitors checked`);
    await this.src.flush();
    return toDto(idea);
  }

  // ---------------------------------------------------------------- the CEO's side

  async shortlist(id: string, on: boolean, actor: string): Promise<IdeaDto> {
    const i = this.find(id);
    this.assertOpen(i);
    const pf = this.src.get();
    const idea = pf.updateIdea(id, { status: on ? 'shortlisted' : 'new' }, actor);
    idea.decided_by = actor;
    pf.saveRegistry();
    await this.src.flush();
    return toDto(idea);
  }

  async accept(id: string, dto: AcceptIdeaDto, actor: string): Promise<AcceptedIdeaDto> {
    this.assertOpen(this.find(id));
    const pf = this.src.get();
    const r = pf.promote(id, { ...dto }, actor);
    r.idea.decided_by = actor;
    r.idea.decided_at = pf.now();
    pf.saveRegistry();
    await this.src.flush();
    return { idea: toDto(r.idea), productId: r.product.id, productSlug: r.product.slug || r.product.id, productName: r.product.name };
  }

  async reject(id: string, reason: string, actor: string): Promise<IdeaDto> {
    this.assertOpen(this.find(id));
    const pf = this.src.get();
    const idea = pf.updateIdea(id, { status: 'rejected', reject_reason: reason }, actor);
    idea.decided_by = actor;
    idea.decided_at = pf.now();
    idea.reject_reason = reason;
    pf.saveRegistry();
    await this.src.flush();
    return toDto(idea);
  }

  private assertOpen(i: IdeaRecord) {
    if (i.status === 'innovation') throw new ConflictException({ code: 'idea_not_sent', message: `${i.id} is still in innovation. Its pitcher has not sent it to the CEO yet.` });
    if (i.status === 'promoted') throw new ConflictException({ code: 'idea_already_accepted', message: `${i.id} already became product ${i.product_id}.` });
    if (i.status === 'rejected') throw new ConflictException({ code: 'idea_already_rejected', message: `${i.id} was already rejected${i.decided_by ? ' by ' + i.decided_by : ''}.` });
  }
}
