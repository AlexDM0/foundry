/**
 * Each entity's work on a live forge over entities. What matters: a ticket in a package stage of another entity's crossing counts at
 * the crossed package as a crossing, never as its own ticket there nor as one of its home entity's tickets; an entity counts only its
 * tickets on its phases, so a ready ticket and a closed ticket count nowhere; the forge row counts the board's jobs and the merge
 * train; an entity's page shows only the crossings out of it or into it; an entity's jobs that hold a slot stand against its cap,
 * worded in jobs, naming the entities whose crossings they serve, and its ready tickets without a job wait for a slot, a held one
 * never; a root kept for a person runs no jobs; and the tickets in flight group by the entity whose stage they run, in the entities'
 * order, those naming none last.
 */
import { describe, expect, test } from 'bun:test';

import { pipelineBoardStateOf }                   from '../../../testing/PipelineFixture.ts';
import { EntityWorkModel, type EntityWorkTicket } from './EntityWorkModel.ts';

const LIVE = pipelineBoardStateOf('mono-live');

const TICKETS: readonly EntityWorkTicket[] = [
  { ticketId: '21', displayState: 'in-progress', entity: 'web' },
  {
    ticketId: '22', displayState: 'in-progress', entity: 'web', stage: { name: 'package-review', entity: 'design-system' },
  },
  {
    ticketId: '25', displayState: 'in-progress', entity: 'web', stage: { name: 'adapt', entity: 'web' },
  },
  { ticketId: '26', displayState: 'committed' },
];

describe('railActivityTextOf', () => {
  test('an entity\'s tickets on its phases, then the crossings in a package stage there; a ready, crossing or closed ticket counts not as its own', () => {
    expect(EntityWorkModel.railActivityTextOf('web', LIVE)).toBe('2 tickets');
    expect(EntityWorkModel.railActivityTextOf('design-system', LIVE)).toBe('1 ticket · 1 crossing');
    expect(EntityWorkModel.railActivityTextOf('root', LIVE)).toBe('No tickets');
  });
});

describe('forgeRailActivityTextOf', () => {
  test('the board\'s jobs against its limit, then the merge train; the limit alone without a count, nothing without a limit', () => {
    expect(EntityWorkModel.forgeRailActivityTextOf(LIVE)).toBe('2 of 2 jobs · 1 merging, 1 waiting');
    expect(EntityWorkModel.forgeRailActivityTextOf({ concurrency: { limit: 1 }, pipelineFlow: null })).toBe('1 job at once');
    expect(EntityWorkModel.forgeRailActivityTextOf({})).toBeNull();
  });
});

describe('crossingsNowOf', () => {
  test('the crossings in a package stage out of the entity or into it, worded by the stage', () => {
    const page = { payload: { boardFacts: { tickets: TICKETS } } };
    expect(EntityWorkModel.crossingsNowOf('web', { page })).toEqual([{
      key:           '22',
      ticketId:      '22',
      href:          '#kanban/ticket/22',
      homeEntity:    'web',
      packageEntity: 'design-system',
      stageText:     'package review, by design-system’s reviewer',
    }]);
    expect(EntityWorkModel.crossingsNowOf('design-system', { page }).map((crossing) => crossing.ticketId)).toEqual(['22']);
    expect(EntityWorkModel.crossingsNowOf('root', { page })).toEqual([]);
  });
});

describe('crossingActivityTextOf', () => {
  test('names the crossing of a package stage only', () => {
    const facts = { page: { payload: { boardFacts: { tickets: TICKETS } } } };
    expect(EntityWorkModel.crossingActivityTextOf('22', facts)).toBe('Package review of a crossing from web');
    expect(EntityWorkModel.crossingActivityTextOf('25', facts)).toBeNull();
    expect(EntityWorkModel.crossingActivityTextOf('21', facts)).toBeNull();
    expect(EntityWorkModel.crossingActivityTextOf('99', facts)).toBeNull();
  });
});

describe('concurrencyRowsOf', () => {
  test('each entity\'s slot jobs against its cap, the crossings they serve and its ready tickets that wait', () => {
    expect(EntityWorkModel.concurrencyRowsOf(LIVE).map((row) => [row.entityKey, row.capText, row.runningText, row.atCap, row.waitingTickets.map((chip) => chip.text)]))
      .toEqual([
        ['web', '1 job', '1', true, ['24']],
        ['design-system', 'Board limit', '1 · crossing from web', false, []],
        ['root', 'For a person', 'No jobs', false, []],
      ]);
  });

  test('a held ready ticket never waits for a slot', () => {
    const page = LIVE.page === undefined ? undefined : { payload: { boardFacts: { ...LIVE.page.payload.boardFacts, readyTickets: [{ id: '24', held: true as const }] } }, };
    const rows = EntityWorkModel.concurrencyRowsOf({ ...LIVE, ...(page === undefined ? {} : { page }) });
    expect(rows.find((row) => row.entityKey === 'web')?.waitingTickets).toEqual([]);
  });
});

describe('inFlightGroupsOf', () => {
  test('groups by the entity whose stage runs, in the entities\' order, a crossing under its package, those naming none last', () => {
    const groups = EntityWorkModel.inFlightGroupsOf(['26', '22', '21', '25'], TICKETS, ['web', 'design-system']);
    expect(groups.map((group) => [group.entity, group.tickets.map((ticket) => [ticket.chip.text, ticket.crossingText])])).toEqual([
      ['web', [['21', null], ['25', null]]],
      ['design-system', [['22', 'crossing from web']]],
      [null, [['26', null]]],
    ]);
  });
});
