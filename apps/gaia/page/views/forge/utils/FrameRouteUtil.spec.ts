/**
 * The frame's routes. What matters: a board route becomes the Bridge's fragment with each item segment encoded and reads back whole; a
 * fragment naming no board tab, as the Bridge's start, reads as none; a malformed item reads as the tab alone.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRoute } from '../../../board/shell/BoardRouter.ts';
import { FrameRouteUtil }  from './FrameRouteUtil.ts';

describe('the Bridge\'s fragment of a board route', () => {
  test('writes the tab and each item segment encoded, and reads back to the same route', () => {
    const routes: BoardRoute[] = [{ tab: 'questions', item: 'E2' }, { tab: 'kanban', item: 'ticket/T 42' }, { tab: 'agents', item: null }];
    expect(routes.map(FrameRouteUtil.bridgeFragmentOf)).toEqual(['#questions/E2', '#kanban/ticket/T%2042', '#agents']);
    expect(routes.map(FrameRouteUtil.bridgeFragmentOf).map(FrameRouteUtil.boardRouteOfBridgeFragment)).toEqual(routes);
  });

  test('reads a fragment naming no board tab as none, and a malformed item as the tab alone', () => {
    expect(['', '#', '#settings', '#session=abc'].map(FrameRouteUtil.boardRouteOfBridgeFragment)).toEqual([null, null, null, null]);
    expect(FrameRouteUtil.boardRouteOfBridgeFragment('#agents/%E0%A4%A')).toEqual({ tab: 'agents', item: null });
  });
});
