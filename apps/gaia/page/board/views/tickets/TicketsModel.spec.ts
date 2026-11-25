/**
 * The Tickets segments' rules. What matters: every status stands in exactly one segment; a route item names a segment only by its own
 * word, so a detail item never moves the view; the view opens on the routed segment first, then In draft while something there waits on
 * User, then the stored choice, an unknown stored word reading as In draft; and a digits query looks for an id alone while any other
 * looks through the row's words.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTicketStatus } from '../../../@types/board/BoardVocabulary.ts';
import { exampleTicketsTicket }   from '../../testing/TicketsBoardFixture.ts';
import { TicketsModel }           from './TicketsModel.ts';

const STATUSES: readonly BoardTicketStatus[] = ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'];

describe('segments', () => {
  test('drafts and tickets for review are In draft, committed to merged are Active, delivered and abandoned are Finished', () => {
    expect(STATUSES.map(TicketsModel.segmentOfStatus)).toEqual(['in-draft', 'in-draft', 'active', 'active', 'active', 'active', 'finished', 'finished']);
  });

  test('a route item names a segment only by its own word', () => {
    expect(['in-draft', 'active', 'finished', 'ticket/12', 'draft/D7', null].map(TicketsModel.segmentOfRouteItem))
      .toEqual(['in-draft', 'active', 'finished', null, null, null]);
  });
});

describe('the segment the view opens on', () => {
  test('a routed segment wins over what waits and what was stored', () => {
    expect(TicketsModel.openingSegmentOf('finished', true, 'active')).toBe('finished');
  });

  test('In draft while something there waits on User, whatever was stored', () => {
    expect(TicketsModel.openingSegmentOf(null, true, 'finished')).toBe('in-draft');
  });

  test('the stored segment while nothing waits, and In draft for none or an unknown word', () => {
    expect([TicketsModel.openingSegmentOf(null, false, 'active'), TicketsModel.openingSegmentOf(null, false, null), TicketsModel.openingSegmentOf(null, false, 'kanban')])
      .toEqual(['active', 'in-draft', 'in-draft']);
  });
});

describe('the search', () => {
  const row = { idText: '#120', words: ['Saved addresses list', 'Account area'] };

  test('an empty search matches every row, and a word matches any of the row\'s words in any case', () => {
    expect([TicketsModel.rowMatches(row, '  '), TicketsModel.rowMatches(row, 'ACCOUNT'), TicketsModel.rowMatches(row, 'invoice')]).toEqual([true, true, false]);
  });

  test('a digits query looks for the id alone, with or without its hash', () => {
    expect([TicketsModel.rowMatches(row, '12'), TicketsModel.rowMatches(row, '#120'), TicketsModel.rowMatches({ ...row, words: ['Ticket 12 of the list'] }, '13')])
      .toEqual([true, true, false]);
  });
});

test('Flint is cued with each ticket\'s status, resolved priority and what filed it', () => {
  const ticket = exampleTicketsTicket('7', { priority: 'high', status: 'in-progress', foundInReview: 'R2' });
  expect(TicketsModel.cuedTicketsOf([ticket])).toEqual([{
    id: '7', status: 'in-progress', resolvedPriority: 'high', hold: null, dependsOn: [], foundInReview: 'R2', introducedBy: null
  }]);
});
