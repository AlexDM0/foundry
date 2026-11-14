/**
 * What the tickets habitat answers between two payloads (`09-bridge-wiring.md`, "New habitats", `tickets`). What matters: each row of
 * the table is answered from its change, once, and not from a fact that only stays; a new ticket shows one thing, a plain one filed, one a
 * review found jarred, and a bug naming the ticket that let it out chased from that ticket; an absent priority is `normal`; and several
 * changes come in the order of the table.
 */
import { describe, expect, test } from 'bun:test';

import { TicketsSpriteModel, type CuedTicket } from './TicketsSpriteModel.ts';

function ticket(id: string, changes: Partial<Omit<CuedTicket, 'id'>> = {}): CuedTicket {
  return { id, status: 'pending', ...changes };
}

const PENDING = [ticket('001')];

describe('the rows of the table', () => {
  test.each<readonly [string, readonly CuedTicket[], readonly CuedTicket[], readonly string[]]>([
    ['a ticket goes from draft to pending', [ticket('001', { status: 'draft' })], PENDING, ['draft-readied']],
    ['a ticket appears', PENDING, [...PENDING, ticket('002')], ['ticket-filed']],
    ['a ticket\'s priority changes', PENDING, [ticket('001', { priority: 'high' })], ['priority-changed']],
    ['a ticket\'s dependsOn gets an id', [ticket('001', { dependsOn: ['002'] })], [ticket('001', { dependsOn: ['002', '003'] })], ['dependency-added']],
    ['a ticket\'s hold is set', PENDING, [ticket('001', { hold: '' })], ['ticket-held']],
    ['a ticket becomes delivered', [ticket('001', { status: 'reviewed' })], [ticket('001', { status: 'delivered' })], ['ticket-delivered']],
    ['a ticket with foundInReview appears', PENDING, [...PENDING, ticket('002', { foundInReview: '001' })], ['review-filed-a-ticket']],
  ])('%s', (_description, previous, next, cueNames) => {
    expect(TicketsSpriteModel.happeningsBetween(previous, next)).toEqual({ cueNames, elementHappenings: [] });
  });

  test('a ticket with introducedBy appears: the bug is chased from the ticket it names, or escapes when that is not shown', () => {
    expect(TicketsSpriteModel.happeningsBetween(PENDING, [...PENDING, ticket('002', { introducedBy: '001', foundInReview: '001' })])).toEqual({
      cueNames:          [],
      elementHappenings: [{ intent: 'chase-bug', elementKey: '001', fallbackCue: 'bug-source-is-not-shown' }],
    });
  });
});

describe('what is no change', () => {
  test.each<readonly [string, readonly CuedTicket[], readonly CuedTicket[]]>([
    ['the same tickets', [ticket('001', { hold: 'waits', dependsOn: ['002'], priority: 'high' })], [ticket('001', { hold: 'waits', dependsOn: ['002'], priority: 'high' })]],
    ['an absent priority and normal', PENDING, [ticket('001', { priority: 'normal' })]],
    ['a ticket that goes from ready-for-review to pending', [ticket('001', { status: 'ready-for-review' })], PENDING],
    ['a dependency that goes', [ticket('001', { dependsOn: ['002'] })], PENDING],
    ['a hold whose reason changes', [ticket('001', { hold: '' })], [ticket('001', { hold: 'waits on User' })]],
    ['a ticket that leaves', [...PENDING, ticket('002')], PENDING],
  ])('%s', (_description, previous, next) => {
    expect(TicketsSpriteModel.happeningsBetween(previous, next)).toEqual({ cueNames: [], elementHappenings: [] });
  });
});

test('several changes come in the order of the table', () => {
  const previous = [ticket('001', { status: 'reviewed' }), ticket('002', { status: 'draft' })];
  const next = [ticket('001', { status: 'delivered', hold: '' }), ticket('002'), ticket('003'), ticket('004', { foundInReview: '001' })];
  expect(TicketsSpriteModel.happeningsBetween(previous, next).cueNames).toEqual([
    'draft-readied', 'ticket-filed', 'ticket-held', 'ticket-delivered', 'review-filed-a-ticket',
  ]);
});
