/**
 * The forge level's live page. What matters: the merge train lists the tickets in the Airlock before the queue, each with its place, its
 * state and how long it has waited, and leaves out drafts and tickets elsewhere on the flow; each row names the entity its ticket names, or
 * none while it names none; the board counts its jobs in flight against its limit, in jobs.
 */
import { describe, expect, test } from 'bun:test';

import { pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { ForgeLevelLiveModel }  from './ForgeLevelLiveModel.ts';

const NOW = new Date('2026-11-12T12:00:00');

describe('mergeTrainRowsOf', () => {
  test('the Airlock first, then the queue, each with its wait', () => {
    const flow = pipelineBoardStateOf('mono-live').pipelineFlow;
    if (flow === null || flow === undefined) throw new Error('the fixture mono-live has no flow');
    expect(ForgeLevelLiveModel.mergeTrainRowsOf(flow, NOW).map((row) => [row.positionText, row.ticketId, row.inAirlock, row.stateText, row.href])).toEqual([
      ['1', '19', true, 'In the Airlock · merging onto main', '#kanban/ticket/19'],
      ['2', '23', false, 'Waiting for the Airlock', '#kanban/ticket/23'],
    ]);
    expect(ForgeLevelLiveModel.mergeTrainRowsOf(flow, NOW).map((row) => row.waitingText).every((text) => text !== '')).toBe(true);
  });
});

describe('the entity of each ticket in the train', () => {
  test('is the one the ticket names, or none while it names none', () => {
    const flow = pipelineBoardStateOf('mono-live').pipelineFlow;
    if (flow === null || flow === undefined) throw new Error('the fixture mono-live has no flow');
    const entityByTicket: Readonly<Record<string, string>> = { 19: 'web' };
    const rows = ForgeLevelLiveModel.mergeTrainRowsOf(flow, NOW, (ticketId) => (Object.hasOwn(entityByTicket, ticketId) ? entityByTicket[ticketId] ?? null : null));
    expect(rows.map((row) => [row.ticketId, row.entityKey])).toEqual([['19', 'web'], ['23', null]]);
    expect(ForgeLevelLiveModel.mergeTrainRowsOf(flow, NOW).every((row) => row.entityKey === null)).toBe(true);
  });
});

describe('boardJobsTextOf', () => {
  test('the jobs in flight against the limit, or the limit alone', () => {
    expect(ForgeLevelLiveModel.boardJobsTextOf({ limit: 6, agentsInFlight: 4 })).toBe('4 of 6 jobs running');
    expect(ForgeLevelLiveModel.boardJobsTextOf({ limit: 1, agentsInFlight: 0 })).toBe('0 of 1 job running');
    expect(ForgeLevelLiveModel.boardJobsTextOf({ limit: 2 })).toBe('2 jobs at once');
  });
});
