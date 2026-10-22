import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioSource } from '../engine-port/ports';
import type { IdeaRecord, IdeaStatus } from '../types/legacy';
import type { AcceptIdeaDto, AcceptedIdeaDto, IdeaDto, SubmitIdeaDto } from './dto/ideas.dto';

export const OPEN_IDEA: IdeaStatus[] = ['new', 'shortlisted'];

const toDto = (i: IdeaRecord): IdeaDto => ({
  id: i.id, one_liner: i.one_liner, text: i.text || '', requester: i.requester, created_on: i.created_on, status: i.status,
  kind: i.kind, product_id: i.product_id, decided_by: i.decided_by, decided_at: i.decided_at, reject_reason: i.reject_reason,
});

/** Ideas inbox: anyone submits; an admin (founder) accepts it into a product, shortlists it or rejects it with a reason. */
@Injectable()
export class IdeasService {
  constructor(private readonly src: PortfolioSource) {}

  list(status?: IdeaStatus[]): IdeaDto[] {
    const all = this.src.get().ideas();
    const wanted = status && status.length ? status : OPEN_IDEA;
    return all.filter((i) => wanted.includes(i.status)).sort((a, b) => b.created_on.localeCompare(a.created_on) || b.id.localeCompare(a.id)).map(toDto);
  }

  openCount(): number { return this.src.get().ideas().filter((i) => OPEN_IDEA.includes(i.status)).length; }

  async submit(dto: SubmitIdeaDto, actor: string): Promise<IdeaDto> {
    const idea = this.src.get().addIdea({ one_liner: dto.one_liner, text: dto.text, kind: dto.kind, requester: actor }, actor);
    await this.src.flush();
    return toDto(idea);
  }

  private find(id: string): IdeaRecord {
    try { return this.src.get().idea(id); } catch { throw new NotFoundException({ code: 'idea_not_found', message: `There is no idea ${id}.` }); }
  }

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
    if (i.status === 'promoted') throw new ConflictException({ code: 'idea_already_accepted', message: `${i.id} already became product ${i.product_id}.` });
    if (i.status === 'rejected') throw new ConflictException({ code: 'idea_already_rejected', message: `${i.id} was already rejected${i.decided_by ? ' by ' + i.decided_by : ''}.` });
  }
}
