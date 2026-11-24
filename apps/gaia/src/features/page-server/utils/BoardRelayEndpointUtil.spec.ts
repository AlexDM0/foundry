/**
 * The relay's endpoints. What matters: each names its forge, decoded once, and its item; an item that would move the forge's path up a
 * folder, or holds what no forge path template takes, names nothing; and an endpoint names nothing under another endpoint's name.
 */
import { describe, expect, test } from 'bun:test';

import { BoardRelayEndpointUtil } from './BoardRelayEndpointUtil.ts';

describe('a relay endpoint', () => {
  test('names its forge, decoded once, and its item', () => {
    expect(BoardRelayEndpointUtil.valuesOf('board', 'forges/example%20storefront/board')).toEqual({ trackerId: 'example storefront', itemId: null });
    expect(BoardRelayEndpointUtil.valuesOf('jobStream', 'forges/example-storefront-7c41/jobs/J4/stream')).toEqual({ trackerId: 'example-storefront-7c41', itemId: 'J4' });
    expect(BoardRelayEndpointUtil.valuesOf('picture', `forges/example/pictures/${'a'.repeat(64)}`)).toEqual({ trackerId: 'example', itemId: 'a'.repeat(64) });
    expect(BoardRelayEndpointUtil.valuesOf('ticketDocuments', 'forges/example/tickets/001/documents')).toEqual({ trackerId: 'example', itemId: '001' });
    expect(BoardRelayEndpointUtil.valuesOf('ticketDocuments', 'forges/example/tickets/..%2F001/documents')).toBeNull();
  });

  test('names nothing for an item that would move the forge\'s path up a folder or that no path template takes', () => {
    for (const itemId of ['..', '.', '%2E%2E', 'J4%2Fstream', 'J%204', '']) {
      expect([itemId, BoardRelayEndpointUtil.valuesOf('jobStream', `forges/example/jobs/${itemId}/stream`)]).toEqual([itemId, null]);
    }
  });

  test('names nothing for an empty forge, one that does not decode, or another endpoint', () => {
    expect(BoardRelayEndpointUtil.valuesOf('board', 'forges//board')).toBeNull();
    expect(BoardRelayEndpointUtil.valuesOf('board', 'forges/example%E0%A4%A/board')).toBeNull();
    expect(BoardRelayEndpointUtil.valuesOf('board', 'forges/example/board/events')).toBeNull();
    expect(BoardRelayEndpointUtil.matches('pictures')('forges/example/pictures/abc')).toBe(false);
    expect(BoardRelayEndpointUtil.matches('picture')('forges/example/pictures/abc')).toBe(true);
  });
});
