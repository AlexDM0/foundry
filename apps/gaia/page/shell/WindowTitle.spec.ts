/**
 * The view's title and the window's (`docs/design/screens.md`, "Notifications and the window title"). What matters: the window reads
 * `(N) Gaia · <view>`, N being the rail's Attention count, `4+` included, and no count when nothing waits or no document has come; a forge
 * in place is titled by its project, or by its tracker id while the document does not hold it.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_DEGRADED }                                   from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                      from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { WindowTitle }                                      from './WindowTitle.ts';

describe('the view\'s title', () => {
  test('each view is titled by its name, and the Agents view keeps its name with a selection', () => {
    expect([
      WindowTitle.viewTitleOf({ view: 'attention' }, FLEET_FIVE_FORGES),
      WindowTitle.viewTitleOf({ view: 'agents', selectedAgent: { trackerId: 'x', jobId: 'J1' }, query: '' }, FLEET_FIVE_FORGES),
      WindowTitle.viewTitleOf({ view: 'activity' }, FLEET_FIVE_FORGES),
      WindowTitle.viewTitleOf({ view: 'forges', addingARepository: true, forgeInView: null }, FLEET_FIVE_FORGES),
    ]).toEqual(['Attention', 'Agents', 'Activity', 'Forges']);
  });

  test('a forge in place is titled by its project, or by its tracker id while the document does not hold it', () => {
    const route = { view: 'forge', trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront, boardRoute: { tab: 'questions', item: 'E2' } } as const;
    expect(WindowTitle.viewTitleOf(route, FLEET_FIVE_FORGES)).toBe('Example Storefront');
    expect(WindowTitle.viewTitleOf(route, null)).toBe(FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront);
  });
});

describe('the window\'s title', () => {
  test('the count of what waits leads it, with + when more is possible', () => {
    expect(WindowTitle.windowTitleOf('Attention', FLEET_FIVE_FORGES)).toBe('(5) Gaia · Attention');
    expect(WindowTitle.windowTitleOf('Agents', FLEET_DEGRADED)).toBe('(4+) Gaia · Agents');
  });

  test('with nothing waiting, or before the first document, there is no count', () => {
    expect(WindowTitle.windowTitleOf('Attention', FLEET_EMPTY)).toBe('Gaia · Attention');
    expect(WindowTitle.windowTitleOf('Attention', null)).toBe('Gaia · Attention');
  });
});
