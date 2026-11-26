/**
 * `useItemPresence` in a happy-dom document. What matters: the mounted list arrives as a whole, so nothing in it is marked; an item gained
 * later is marked arriving and stays so across renders; a lost item stays in its place, marked leaving, until the clock's leave ends; and
 * a list that comes with a new baseline key is that data's state: nothing in it arrives and nothing before it leaves.
 */
import { act, cleanup, render }    from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { BoardClockContext, type BoardClock }                         from '../shared/BoardClock.ts';
import { LEAVING_MILLISECONDS, presenceAttributeOf, useItemPresence } from './ItemPresence.ts';

afterEach(cleanup);

interface PendingLeave {
  readonly milliseconds: number;
  readonly callback:     () => void;
}

function manualClock(pendingLeaves: PendingLeave[]): BoardClock {
  return {
    now:         () => new Date(0),
    everySecond: () => () => undefined,
    after:       (milliseconds, callback) => {
      pendingLeaves.push({ milliseconds, callback });
      return () => undefined;
    },
  };
}

function PresenceList({ keys, baselineKey }: { readonly keys: readonly string[]; readonly baselineKey?: string | null }) {
  const presentItems = useItemPresence(keys, (key) => key, baselineKey);
  return (
    <ul>
      {presentItems.map(({ key, presence }) => <li key={key} data-presence={presenceAttributeOf(presence)}>{key}</li>)}
    </ul>
  );
}

function shownItemsOf(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map((item) => `${item.textContent ?? ''} ${item.dataset['presence'] ?? 'settled'}`);
}

test('the mounted list is settled, a gained item arrives and stays arriving, and a lost item leaves in its place until the leave ends', () => {
  const pendingLeaves: PendingLeave[] = [];
  const clock = manualClock(pendingLeaves);
  const page = render(<BoardClockContext.Provider value={clock}><PresenceList keys={['a', 'b']} /></BoardClockContext.Provider>);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled']);

  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['a', 'b', 'c']} /></BoardClockContext.Provider>);
  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['b', 'c']} /></BoardClockContext.Provider>);
  expect(shownItemsOf(page.container)).toEqual(['a leaving', 'b settled', 'c arriving']);
  expect(pendingLeaves.at(-1)?.milliseconds).toBe(LEAVING_MILLISECONDS);

  act(() => pendingLeaves.at(-1)?.callback());
  expect(shownItemsOf(page.container)).toEqual(['b settled', 'c arriving']);
});

test('while the baseline key is null nothing arrives, and the list that comes with a new key is its baseline, not an arrival', () => {
  const pendingLeaves: PendingLeave[] = [];
  const clock = manualClock(pendingLeaves);
  const page = render(<BoardClockContext.Provider value={clock}><PresenceList keys={[]} baselineKey={null} /></BoardClockContext.Provider>);
  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['a']} baselineKey={null} /></BoardClockContext.Provider>);
  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['a', 'b']} baselineKey="J1" /></BoardClockContext.Provider>);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled']);

  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['a', 'b', 'c']} baselineKey="J1" /></BoardClockContext.Provider>);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled', 'c arriving']);

  page.rerender(<BoardClockContext.Provider value={clock}><PresenceList keys={['x']} baselineKey="J2" /></BoardClockContext.Provider>);
  expect(shownItemsOf(page.container)).toEqual(['x settled']);
});
