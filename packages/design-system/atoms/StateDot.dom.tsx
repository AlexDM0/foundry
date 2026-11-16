/**
 * The state dot, in a happy-dom document. What matters: it sets `data-state-tone`, which picks its fill, the error tone too; a shape other
 * than solid sets `data-shape`; small and tiny set `data-size`; pulsing sets `data-pulsing`; and it is hidden from the accessibility tree.
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

  test('the error tone sets data-state-tone like every other tone', () => {
    const { container } = render(<StateDot tone="error" />);
    expect(container.querySelector('.design-system-state-dot')?.getAttribute('data-state-tone')).toBe('error');
  });

  test('a ring, a dashed ring and a diamond set data-shape', () => {
    const { container } = render(<><StateDot tone="muted" shape="ring" /><StateDot tone="neutral" shape="dashed-ring" /><StateDot tone="accent" shape="diamond" /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => dot.getAttribute('data-shape'))).toEqual(['ring', 'dashed-ring', 'diamond']);
  });

  test('a diamond keeps its size flag at each size', () => {
    const { container } = render(<><StateDot tone="accent" shape="diamond" /><StateDot tone="accent" shape="diamond" small /><StateDot tone="accent" shape="diamond" tiny /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => [dot.getAttribute('data-shape'), dot.getAttribute('data-size')]))
      .toEqual([['diamond', null], ['diamond', 'small'], ['diamond', 'tiny']]);
  });

  test('pulsing sets data-pulsing, and a still dot sets none', () => {
    const { container } = render(<><StateDot tone="accent" pulsing /><StateDot tone="accent" /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => dot.getAttribute('data-pulsing'))).toEqual(['', null]);
  });

  test('small and tiny set data-size, and the standard size sets nothing', () => {
    const { container } = render(<><StateDot tone="info" /><StateDot tone="info" small /><StateDot tone="info" tiny /></>);
    expect([...container.querySelectorAll('.design-system-state-dot')].map((dot) => dot.getAttribute('data-size'))).toEqual([null, 'small', 'tiny']);
  });
});
