/**
 * A board route as Gaia's address writes it. What matters: the tracker id and every item segment are encoded each on its own, so an item
 * of several segments keeps its separators, and a route with no item names its tab alone.
 */
import { describe, expect, test } from 'bun:test';

import { BoardRouter } from './BoardRouter.ts';

describe('a board route in Gaia\'s address', () => {
  test('names the forge, then the tab alone when no item is open', () => {
    expect(BoardRouter.fragmentOf('example', { tab: 'questions', item: null })).toBe('#forge/example/questions');
  });

  test('encodes the tracker id and each item segment apart, keeping the separators between them', () => {
    expect(BoardRouter.fragmentOf('example tracker/1', { tab: 'tickets', item: 'ticket-row/0 4' })).toBe('#forge/example%20tracker%2F1/tickets/ticket-row/0%204');
  });
});
