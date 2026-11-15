/**
 * The count badge, in a happy-dom document. What matters: it shows the count; each tone sets `data-tone`; a state tone shows only with the
 * `state` tone; a marked count leads with a dot hidden from the accessibility tree; a changed count says which way it went, so it rises or
 * drops in, and the first showing says nothing.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { CountBadge } from './CountBadge.tsx';

afterEach(() => {
  cleanup();
});

describe('the count badge', () => {
  test('shows the count, its tone and, only with the state tone, its state tone', () => {
    const { container } = render(
      <>
        <CountBadge count={3} tone="state" stateTone="accent-outline" />
        <CountBadge count={1} tone="error" />
        <CountBadge count={0} tone="neutral" />
        <CountBadge count={2} tone="warn" />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-count-badge')]
      .map((badge) => [badge.textContent, badge.getAttribute('data-tone'), badge.getAttribute('data-state-tone')]))
      .toEqual([['3', 'state', 'accent-outline'], ['1', 'error', null], ['0', 'neutral', null], ['2', 'warn', null]]);
  });

  test('a marked count leads with a dot hidden from the accessibility tree, and an unmarked one has none', () => {
    const { container } = render(
      <>
        <CountBadge count={1} tone="error" marked />
        <CountBadge count={4} tone="neutral" />
      </>,
    );
    const [marked, unmarked] = [...container.querySelectorAll('.design-system-count-badge')];
    expect([marked?.firstElementChild?.className, marked?.firstElementChild?.getAttribute('aria-hidden'), marked?.textContent])
      .toEqual(['design-system-count-badge-dot', 'true', '1']);
    expect(unmarked?.querySelector('.design-system-count-badge-dot')).toBeNull();
  });

  test('a changed count says which way it went, and the first showing says nothing', () => {
    const { container, rerender } = render(<CountBadge count={3} tone="neutral" />);
    const directionShown = (): string | null | undefined => container.querySelector('.design-system-count-badge-number')?.getAttribute('data-change');
    expect(directionShown()).toBeNull();
    rerender(<CountBadge count={4} tone="neutral" />);
    expect([directionShown(), container.textContent]).toEqual(['up', '4']);
    rerender(<CountBadge count={2} tone="neutral" />);
    expect([directionShown(), container.textContent]).toEqual(['down', '2']);
  });

  test('a state tone does not compile on another tone, nor the state tone without one', () => {
    // @ts-expect-error an error count has colours of its own
    const errorWithStateTone = <CountBadge count={1} tone="error" stateTone="accent-outline" />;
    // @ts-expect-error a state count takes the colours of a state tone
    const stateWithoutTone = <CountBadge count={1} tone="state" />;
    expect([errorWithStateTone, stateWithoutTone]).toHaveLength(2);
  });
});
