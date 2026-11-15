/**
 * The held count of a ticket. What matters: it is the size of the graph's held set, so a ticket nothing waits on counts 0; and its title
 * names one waiting ticket in the singular.
 */
import { describe, expect, test } from 'bun:test';

import { HeldCountUtil } from './HeldCountUtil.ts';

const GRAPH = { heldOfNode: new Map([['070', new Set(['071', '072'])], ['071', new Set(['072'])]]) };

describe('HeldCountUtil.heldCountOf', () => {
  test('counts the tickets the graph holds back behind the ticket, and 0 for one nothing waits on', () => {
    expect(['070', '071', '072'].map((ticketId) => HeldCountUtil.heldCountOf(ticketId, GRAPH))).toEqual([2, 1, 0]);
  });
});

describe('HeldCountUtil.heldTitleOf', () => {
  test('names one waiting ticket in the singular and more in the plural', () => {
    expect(HeldCountUtil.heldTitleOf(1)).toBe('1 ticket waits on this one, directly or further down the chain');
    expect(HeldCountUtil.heldTitleOf(2)).toBe('2 tickets wait on this one, directly or further down the chain');
  });
});
