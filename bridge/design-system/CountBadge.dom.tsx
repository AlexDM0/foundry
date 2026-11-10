/**
 * The count badge, in a happy-dom document. What matters: it shows the count; each tone sets `data-tone`; the state shows only with the
 * state tone; a marked count leads with a dot hidden from the accessibility tree.
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
  test('shows the count, its tone and, only with the state tone, its state', () => {
    const { container } = render(
      <>
        <CountBadge count={3} tone="state" state="ready-for-review" />
        <CountBadge count={1} tone="error" state="ready-for-review" />
        <CountBadge count={0} tone="neutral" />
        <CountBadge count={2} tone="warn" />
      </>,
    );
    expect([...container.querySelectorAll('.bridge-count-badge')].map((badge) => [badge.textContent, badge.getAttribute('data-tone'), badge.getAttribute('data-state')]))
      .toEqual([['3', 'state', 'ready-for-review'], ['1', 'error', null], ['0', 'neutral', null], ['2', 'warn', null]]);
  });

  test('a marked count leads with a dot hidden from the accessibility tree, and an unmarked one has none', () => {
    const { container } = render(
      <>
        <CountBadge count={1} tone="error" marked />
        <CountBadge count={4} tone="neutral" />
      </>,
    );
    const [marked, unmarked] = [...container.querySelectorAll('.bridge-count-badge')];
    expect([marked?.firstElementChild?.className, marked?.firstElementChild?.getAttribute('aria-hidden'), marked?.textContent]).toEqual(['bridge-count-badge-dot', 'true', '1']);
    expect(unmarked?.querySelector('.bridge-count-badge-dot')).toBeNull();
  });
});
