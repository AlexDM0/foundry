/** The state dot, in a happy-dom document. What matters: it sets `data-state`, which picks its fill, and it is hidden from the accessibility tree. */
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
  test('it sets data-state and is hidden from the accessibility tree', () => {
    const { container } = render(<StateDot state="reviewing" />);
    const dot = container.querySelector('.bridge-lane-dot');
    expect([dot?.getAttribute('data-state'), dot?.getAttribute('aria-hidden'), dot?.textContent]).toEqual(['reviewing', 'true', '']);
  });
});
