/**
 * The needs a build job of one entity declares for another entity (strategy section 4.3): checked and kept on the board, in declaring order,
 * for the Overseer to file as that entity's tickets. A declaration logs nothing and files no ticket.
 */
import type { NeedDeclared }                  from './@types/BoardChanges.ts';
import type { DeclaredNeed, NeedDeclaration } from './@types/Need.ts';
import type { ReadinessGap }                  from './@types/Ticket.ts';
import type { BoardRecords }                  from './BoardRecords.ts';
import { BoardRefusal }                       from './BoardRefusal.ts';
import type { Jobs }                          from './Jobs.ts';
import { NeedUtil }                           from './utils/NeedUtil.ts';

/** A job keeps at most this many needs, so a session cannot grow progress.json without end. */
export const DECLARED_NEEDS_PER_JOB = 5;

export class Needs {
  constructor(private readonly records: BoardRecords, private readonly jobRules: Jobs) {}

  /** Only a live build job of an entity declares one, for another entity the pipeline names; the same entity and title replaces the body. */
  declareNeed(jobId: string, declaration: Readonly<NeedDeclaration>, readinessGapsOf: (body: string) => readonly ReadinessGap[]): NeedDeclared {
    const job = this.jobRules.requireJob(jobId);
    if (job.kind !== 'build' || job.entity === undefined) throw new BoardRefusal({ reason: 'need-outside-an-entity-build', jobId });
    const gaps = NeedUtil.gapsOf(declaration, readinessGapsOf);
    if (gaps.length > 0) throw new BoardRefusal({ reason: 'need-incomplete', jobId, gaps });
    const entityKeys = Object.keys(this.records.pipeline?.entities ?? {});
    if (!entityKeys.includes(declaration.entity)) throw new BoardRefusal({
      reason: 'need-entity-unknown', jobId, entity: declaration.entity, entityKeys
    });
    if (declaration.entity === job.entity) throw new BoardRefusal({ reason: 'need-of-own-entity', jobId, entity: declaration.entity });

    const needs          = this.records.progress.needs ?? [];
    const declaredBefore = NeedUtil.needDeclaredBefore(needs, jobId, declaration);
    if (declaredBefore !== undefined) {
      const changed       = declaredBefore.body !== declaration.body;
      declaredBefore.body = declaration.body;
      return { need: declaredBefore, changed, logged: [] };
    }
    if (needs.filter((need) => need.jobId === jobId).length >= DECLARED_NEEDS_PER_JOB) {
      throw new BoardRefusal({ reason: 'need-limit-reached', jobId, limit: DECLARED_NEEDS_PER_JOB });
    }
    const need: DeclaredNeed = {
      jobId, ticketIds: [...job.ticketIds], entity: declaration.entity, title: declaration.title, body: declaration.body
    };
    this.records.progress.needs = [...needs, need];
    return { need, changed: true, logged: [] };
  }

  needs(): readonly Readonly<DeclaredNeed>[] {
    return this.records.progress.needs ?? [];
  }
}
