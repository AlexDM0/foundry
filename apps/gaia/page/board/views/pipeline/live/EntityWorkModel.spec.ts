/**
 * Each entity's work on a live forge over entities: crossings counted at the crossed package, an entity's tickets on its own phases,
 * the forge row's jobs and merge train, each entity's jobs against its cap, and the tickets in flight grouped by entity.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }                     from '../../../../@types/board/BoardDocument.ts';
import { examplePageTicketFacts, exampleTicket }  from '../../../testing/BoardStateFixture.ts';
import { pipelineBoardStateOf }                   from '../../../testing/PipelineFixture.ts';
import { EntityWorkModel, type EntityWorkTicket } from './EntityWorkModel.ts';

const LIVE = pipelineBoardStateOf('mono-live');

function ticketWork(changes: Partial<EntityWorkTicket> & Pick<EntityWorkTicket, 'ticketId' | 'displayState'>): EntityWorkTicket {
  return {
    entity: null, stage: null, isClosed: false, noAgentHasPickedItUp: false, ...changes,
  };
}

const TICKETS: readonly EntityWorkTicket[] = [
  ticketWork({ ticketId: '21', displayState: 'in-progress', entity: 'web' }),
  ticketWork({
    ticketId: '22', displayState: 'in-progress', entity: 'web', stage: { name: 'package-review', entity: 'design-system' },
  }),
  ticketWork({
    ticketId: '25', displayState: 'in-progress', entity: 'web', stage: { name: 'adapt', entity: 'web' },
  }),
  ticketWork({ ticketId: '26', displayState: 'committed', noAgentHasPickedItUp: true }),
];

/** The live board's page holding exactly these tickets, each with its page facts and the flags the forge serves for its status. */
function pageOf(tickets: readonly EntityWorkTicket[]): Pick<BoardDocument, 'page'> {
  return {
    page: {
      ...LIVE.page,
      tickets: tickets.map((ticket) => {
        const example = exampleTicket({ id: ticket.ticketId, title: `Example ${ticket.ticketId}` });
        return { ...example, facts: { ...example.facts, isClosed: ticket.isClosed, noAgentHasPickedItUp: ticket.noAgentHasPickedItUp } };
      }),
      facts: {
        ...LIVE.page.facts,
        tickets: tickets.map((ticket) => ({
          ...examplePageTicketFacts({ id: ticket.ticketId, status: 'in-progress' }), displayState: ticket.displayState, entity: ticket.entity, stage: ticket.stage,
        })),
      },
    },
  };
}

describe('railActivityTextOf', () => {
  test('an entity\'s tickets on its phases, then the crossings in a package stage there; a committed, crossing or closed ticket counts not as its own', () => {
    expect(EntityWorkModel.railActivityTextOf('web', LIVE)).toBe('2 tickets');
    expect(EntityWorkModel.railActivityTextOf('design-system', LIVE)).toBe('1 ticket · 1 crossing');
    expect(EntityWorkModel.railActivityTextOf('root', LIVE)).toBe('No tickets');
  });
});

describe('forgeRailActivityTextOf', () => {
  test('the board\'s jobs against its limit, then the merge train; the jobs alone without a flow', () => {
    expect(EntityWorkModel.forgeRailActivityTextOf(LIVE)).toBe('2 of 2 jobs · 1 merging, 1 waiting');
    expect(EntityWorkModel.forgeRailActivityTextOf({ concurrency: { limit: 1, agentsInFlight: 0 }, pipeline: { ...LIVE.pipeline, flow: null } })).toBe('0 of 1 job');
  });
});

describe('crossingsNowOf', () => {
  test('the crossings in a package stage out of the entity or into it, worded by the stage', () => {
    const page = pageOf(TICKETS);
    expect(EntityWorkModel.crossingsNowOf('web', page)).toEqual([{
      key:           '22',
      ticketId:      '22',
      route:         { tab: 'tickets', item: 'ticket/22' },
      homeEntity:    'web',
      packageEntity: 'design-system',
      stageText:     'package review, by design-system’s reviewer',
    }]);
    expect(EntityWorkModel.crossingsNowOf('design-system', page).map((crossing) => crossing.ticketId)).toEqual(['22']);
    expect(EntityWorkModel.crossingsNowOf('root', page)).toEqual([]);
  });
});

describe('crossingActivityTextOf', () => {
  test('names the crossing of a package stage only', () => {
    const facts = pageOf(TICKETS);
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
    const page = { ...LIVE.page, facts: { ...LIVE.page.facts, readyTickets: [{ id: '24', isHeld: true }] } };
    const rows = EntityWorkModel.concurrencyRowsOf({ ...LIVE, page });
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
