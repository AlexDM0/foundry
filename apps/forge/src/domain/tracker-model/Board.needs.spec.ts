/**
 * A build job's need for another entity (`need declare`): only a live build job of an entity declares one, never for its own entity, each
 * refusal changing nothing; it logs nothing; the same entity and title replaces the body; and a job keeps a bounded number, so a session
 * cannot grow progress.json without end.
 */
import { describe, expect, test } from 'bun:test';

import {
  boardFixture,
  entityPipelineFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type { JobLaunch }         from './@types/Job.ts';
import type { Pipeline }          from './@types/Pipeline.ts';
import type { ReadinessGap }      from './@types/Ticket.ts';
import { DECLARED_NEEDS_PER_JOB } from './Needs.ts';
import { PipelineUtil }           from './utils/PipelineUtil.ts';

const AT = '2026-11-17T10:15:00+01:00';

const NO_GAPS = (): ReadinessGap[] => [];

const DECLARATION = { entity: 'design-system', title: 'Export the basket total', body: '## Acceptance\n\nA1. The total.\n\n## Brief\n\nNeeded.\n' };

const BUILD_OF_WEB: JobLaunch = {
  kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main', entity: 'web', stage: 1
};

function boardWithAJob(launch: JobLaunch = BUILD_OF_WEB, pipeline: Pipeline | undefined = entityPipelineFixture()): ReturnType<typeof boardFixture> {
  const fixture = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress' })], ...(pipeline === undefined ? {} : { pipeline }) });
  fixture.board.launchJob(launch, AT);
  fixture.records.length = 0;
  return fixture;
}

describe('declaring a need', () => {
  test('a build job of an entity keeps the need with its tickets, and logs nothing', () => {
    const { board, progress, records } = boardWithAJob();
    const declared = board.declareNeed('J1', DECLARATION, NO_GAPS);

    const need = { jobId: 'J1', ticketIds: ['001'], ...DECLARATION };
    expect(declared).toEqual({ need, changed: true, logged: [] });
    expect(progress.needs).toEqual([need]);
    expect(board.needs()).toEqual([need]);
    expect(records).toEqual([]);
  });

  test('the same entity and title replaces the body; the same body again is no change', () => {
    const { board, progress } = boardWithAJob();
    board.declareNeed('J1', DECLARATION, NO_GAPS);
    const replaced = board.declareNeed('J1', { ...DECLARATION, body: `${DECLARATION.body}\nThe web app reads it.\n` }, NO_GAPS);
    const repeated = board.declareNeed('J1', { ...DECLARATION, body: `${DECLARATION.body}\nThe web app reads it.\n` }, NO_GAPS);

    expect(replaced.changed).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(progress.needs?.map((need) => need.body)).toEqual([`${DECLARATION.body}\nThe web app reads it.\n`]);
  });

  test('another title is another need, kept in declaring order', () => {
    const { board, progress } = boardWithAJob();
    board.declareNeed('J1', DECLARATION, NO_GAPS);
    board.declareNeed('J1', { ...DECLARATION, entity: 'root', title: 'Pin the lockfile' }, NO_GAPS);
    expect(progress.needs?.map((need) => need.title)).toEqual(['Export the basket total', 'Pin the lockfile']);
  });

  test('the need past DECLARED_NEEDS_PER_JOB is refused need-limit-reached, the one before it kept', () => {
    const { board, progress } = boardWithAJob();
    for (let i = 1; i <= DECLARED_NEEDS_PER_JOB; i++) board.declareNeed('J1', { ...DECLARATION, title: `Need ${i}` }, NO_GAPS);
    expect(refusalDetailOf(() => board.declareNeed('J1', { ...DECLARATION, title: 'One more' }, NO_GAPS)))
      .toEqual({ reason: 'need-limit-reached', jobId: 'J1', limit: DECLARED_NEEDS_PER_JOB });
    expect(progress.needs).toHaveLength(DECLARED_NEEDS_PER_JOB);
  });
});

describe('what a need is refused for, with nothing written', () => {
  test('a forge without entities refuses it need-outside-an-entity-build and never writes needs', () => {
    const { entity: _entity, stage: _stage, ...buildWithoutEntity } = BUILD_OF_WEB;
    for (const pipeline of [undefined, PipelineUtil.minimalPipelineOf()]) {
      const { board, progress } = boardWithAJob(buildWithoutEntity, pipeline);
      expect(refusalDetailOf(() => board.declareNeed('J1', DECLARATION, NO_GAPS))).toEqual({ reason: 'need-outside-an-entity-build', jobId: 'J1' });
      expect(Object.hasOwn(progress, 'needs')).toBe(false);
    }
  });

  test('a review job of an entity is refused need-outside-an-entity-build', () => {
    const { board, progress } = boardWithAJob({ ...BUILD_OF_WEB, kind: 'review', role: 'reviewer' });
    expect(refusalDetailOf(() => board.declareNeed('J1', DECLARATION, NO_GAPS))).toEqual({ reason: 'need-outside-an-entity-build', jobId: 'J1' });
    expect(Object.hasOwn(progress, 'needs')).toBe(false);
  });

  test('an incomplete need is refused need-incomplete, naming each gap', () => {
    const { board, progress } = boardWithAJob();
    const brief = (): ReadinessGap[] => ['brief-missing'];
    expect(refusalDetailOf(() => board.declareNeed('J1', { ...DECLARATION, title: ' ' }, brief)))
      .toEqual({ reason: 'need-incomplete', jobId: 'J1', gaps: ['title-missing', 'brief-missing'] });
    expect(Object.hasOwn(progress, 'needs')).toBe(false);
  });

  test('an entity the pipeline does not name is refused need-entity-unknown, naming the ones it does', () => {
    const { board, progress } = boardWithAJob();
    expect(refusalDetailOf(() => board.declareNeed('J1', { ...DECLARATION, entity: 'shop' }, NO_GAPS))).toEqual({
      reason: 'need-entity-unknown', jobId: 'J1', entity: 'shop', entityKeys: ['root', 'web', 'design-system']
    });
    expect(Object.hasOwn(progress, 'needs')).toBe(false);
  });

  test('the job\'s own entity is refused need-of-own-entity', () => {
    const { board, progress } = boardWithAJob();
    expect(refusalDetailOf(() => board.declareNeed('J1', { ...DECLARATION, entity: 'web' }, NO_GAPS)))
      .toEqual({ reason: 'need-of-own-entity', jobId: 'J1', entity: 'web' });
    expect(Object.hasOwn(progress, 'needs')).toBe(false);
  });

  test('an unknown job is refused as every job move is', () => {
    const { board } = boardWithAJob();
    expect(refusalDetailOf(() => board.declareNeed('J9', DECLARATION, NO_GAPS)).reason).toBe('unknown-job');
  });
});
