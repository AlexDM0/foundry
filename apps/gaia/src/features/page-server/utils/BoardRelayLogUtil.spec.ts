/** One line of Gaia's log per relay entry. What matters: each line names the forge, what was dropped or refused and why, on one line. */
import { describe, expect, test } from 'bun:test';

import { BoardRelayLogUtil } from './BoardRelayLogUtil.ts';

describe('a relay log line', () => {
  test('names the forge, the stream and the keys of an event it dropped', () => {
    expect(BoardRelayLogUtil.lineOf({
      kind: 'event-dropped', trackerId: 'example-storefront-7c41', stream: '/api/v1/profiles/P1/stream', eventName: 'line', invalidKeys: ['text'],
    })).toBe('Gaia dropped a line event of example-storefront-7c41\'s /api/v1/profiles/P1/stream it could not read: text.\n');
  });

  test('names both versions of a handshake that differs, and the keys of a board it could not read', () => {
    expect(BoardRelayLogUtil.lineOf({
      kind: 'handshake-version-differs', trackerId: 'example', stream: '/api/v1/events', versionWatchRead: { major: 1, minor: 23 }, versionHandshakeNamed: null,
    })).toBe('Gaia closed example\'s /api/v1/events: its handshake named version none, and the watch read 1.23.\n');
    expect(BoardRelayLogUtil.lineOf({ kind: 'board-unreadable', trackerId: 'example', invalidKeys: ['overseer', 'jobs[0].id'] }))
      .toBe('Gaia could not read example\'s board: overseer, jobs[0].id.\n');
  });
});
