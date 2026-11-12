/**
 * The model and effort meter, in a happy-dom document. What matters: it is one image named by its accessible name, with five bars unless
 * told otherwise, of which exactly the level's count are filled, for every level from 1 to 5; the size is an attribute; a meter without a
 * derived note takes no focus and has no tooltip, while a derived one is marked, takes the focus and is described by its tooltip; the words
 * are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ModelEffortMeter } from './ModelEffortMeter.tsx';

const LEVELS = [1, 2, 3, 4, 5] as const;

afterEach(() => {
  cleanup();
});

function filledStatesOf(meter: HTMLElement): boolean[] {
  return [...meter.querySelectorAll('.bridge-effort-meter-bar')].map((bar) => bar.hasAttribute('data-filled'));
}

describe('the model and effort meter', () => {
  test('five bars by default, the level\'s count of them filled, for every level', () => {
    const filledCounts = LEVELS.map((level) => {
      render(<ModelEffortMeter model="opus" effort="high" level={level} accessibleName={`Level ${level}`} size="node" />);
      const filledStates = filledStatesOf(screen.getByRole('img', { name: `Level ${level}` }));
      return [filledStates.length, filledStates.filter(Boolean).length, filledStates.indexOf(false)];
    });
    expect(filledCounts).toEqual([[5, 1, 1], [5, 2, 2], [5, 3, 3], [5, 4, 4], [5, 5, -1]]);
  });

  test('another level count draws that many bars', () => {
    render(<ModelEffortMeter model="sonnet" effort="low" level={1} levelCount={4} accessibleName="Four bars" size="dialog" />);
    expect(filledStatesOf(screen.getByRole('img', { name: 'Four bars' }))).toEqual([true, false, false, false]);
  });

  test('the model and effort words and the size, with no focus and no tooltip without a derived note', () => {
    render(<ModelEffortMeter model="<b>opus</b>" effort="high" level={4} accessibleName="Builder: opus, high effort" size="hero" />);
    const meter = screen.getByRole('img', { name: 'Builder: opus, high effort' });
    expect([
      meter.querySelector('.bridge-effort-meter-model')?.textContent,
      meter.querySelector('.bridge-effort-meter-effort')?.textContent,
      meter.getAttribute('data-size'),
      meter.hasAttribute('data-derived'),
      meter.getAttribute('tabindex'),
      meter.querySelector('b'),
      screen.queryByRole('tooltip'),
    ]).toEqual(['<b>opus</b>', 'high', 'hero', false, null, null, null]);
  });

  test('a derived meter is marked, takes the focus and is described by its tooltip', () => {
    render(
      <ModelEffortMeter
        model="opus"
        effort="high"
        level={4}
        accessibleName="Merge: opus, high effort, derived"
        size="node"
        derivedNote={{ title: 'Derived from the builder', text: 'Change it on that step.' }}
      />,
    );
    const meter = screen.getByRole('img', { name: 'Merge: opus, high effort, derived' });
    const tooltip = screen.getByRole('tooltip');
    meter.focus();
    expect([
      meter.hasAttribute('data-derived'),
      meter.getAttribute('tabindex'),
      document.activeElement === meter,
      meter.getAttribute('aria-describedby') === tooltip.id,
      tooltip.textContent,
      meter.querySelector('.bridge-effort-meter-glyph')?.getAttribute('aria-hidden'),
    ]).toEqual([true, '0', true, true, 'Derived from the builderChange it on that step.', 'true']);
  });
});
