/**
 * The state dot, in a happy-dom document. What matters: it sets `data-state-tone`, which picks its fill, a shape other than solid sets
 * `data-shape`, small and tiny set `data-size`, and it is hidden from the accessibility tree.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { StateDot } from './StateDot.tsx';

afterEach(() => {
  cleanup();
});

describe('the state dot', () => {
  test('it sets data-state-tone, no shape when solid, and is hidden from the accessibility tree', () => {
    const { container } = render(<StateDot tone="info" />);
    const dot = container.querySelector('.design-system-state-dot');
    expect([dot?.getAttribute('data-state-tone'), dot?.hasAttribute('data-shape'), dot?.getAttribute('aria-hidden'), dot?.textContent])
      .toEqual(['info', false, 'true', '']);
  });

  test('a ring and a dashed ring set data-shape', () => {
    const { container } = render(<><StateDot tone="muted" shape="ring" /><StateDot tone="neutral" shape="dashed-ring" /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => dot.getAttribute('data-shape'))).toEqual(['ring', 'dashed-ring']);
  });

  test('small and tiny set data-size, and the standard size sets nothing', () => {
    const { container } = render(<><StateDot tone="info" /><StateDot tone="info" small /><StateDot tone="info" tiny /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => dot.getAttribute('data-size'))).toEqual([null, 'small', 'tiny']);
  });
});
