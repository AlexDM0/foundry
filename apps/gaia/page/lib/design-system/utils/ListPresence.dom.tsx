/**
 * `useListPresence`: the mounted list arrives whole, unmarked; an item gained later is marked arriving across renders; a lost item stays in place
 * marked leaving through its leaving animation, or goes at once without one; and a list with a new baseline key is that data's state, with
 * nothing arriving or leaving.
 */
import {
  act,
  cleanup,
  render,
  waitFor
} from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import { useRef }                  from 'react';

import { presenceAttributeOf, useListPresence } from './ListPresence.ts';

afterEach(cleanup);

interface PresenceListProps {
  readonly keys:             readonly string[];
  readonly baselineKey?:     string | null;
  /** The leaving animation's duration, such as `10s`; absent, a leaving item has no animation. */
  readonly leavingDuration?: string;
}

function PresenceList({ keys, baselineKey, leavingDuration }: PresenceListProps) {
  const list = useRef<HTMLUListElement | null>(null);
  const presentItems = useListPresence(keys, (key) => key, list, baselineKey);
  const leavingStyle = leavingDuration === undefined ? undefined : { animationName: 'example-leave', animationDuration: leavingDuration };
  return (
    <ul ref={list}>
      {presentItems.map(({ key, presence }) => (
        <li key={key} data-presence={presenceAttributeOf(presence)} style={presence === 'leaving' ? leavingStyle : undefined}>{key}</li>
      ))}
    </ul>
  );
}

function shownItemsOf(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map((item) => `${item.textContent ?? ''} ${item.dataset['presence'] ?? 'settled'}`);
}

test('the mounted list is settled, a gained item arrives and stays arriving, and a lost item leaves in its place through its animation', async () => {
  const page = render(<PresenceList keys={['a', 'b']} leavingDuration="0.02s" />);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled']);

  page.rerender(<PresenceList keys={['a', 'b', 'c']} leavingDuration="0.02s" />);
  act(() => page.rerender(<PresenceList keys={['b', 'c']} leavingDuration="0.02s" />));
  expect(shownItemsOf(page.container)).toEqual(['a leaving', 'b settled', 'c arriving']);

  await waitFor(() => {
    expect(shownItemsOf(page.container)).toEqual(['b settled', 'c arriving']);
  });
});

test('a lost item stays while its animation runs, and with no leaving animation it goes at once', () => {
  const animated = render(<PresenceList keys={['a', 'b']} leavingDuration="10s" />);
  act(() => animated.rerender(<PresenceList keys={['b']} leavingDuration="10s" />));
  expect(shownItemsOf(animated.container)).toEqual(['a leaving', 'b settled']);
  cleanup();

  const still = render(<PresenceList keys={['a', 'b']} />);
  act(() => still.rerender(<PresenceList keys={['b']} />));
  expect(shownItemsOf(still.container)).toEqual(['b settled']);
});

test('while the baseline key is null nothing arrives, and the list that comes with a new key is its baseline, not an arrival', () => {
  const page = render(<PresenceList keys={[]} baselineKey={null} />);
  page.rerender(<PresenceList keys={['a']} baselineKey={null} />);
  page.rerender(<PresenceList keys={['a', 'b']} baselineKey="J1" />);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled']);

  page.rerender(<PresenceList keys={['a', 'b', 'c']} baselineKey="J1" />);
  expect(shownItemsOf(page.container)).toEqual(['a settled', 'b settled', 'c arriving']);

  page.rerender(<PresenceList keys={['x']} baselineKey="J2" />);
  expect(shownItemsOf(page.container)).toEqual(['x settled']);
});
