/**
 * The state pill, in a happy-dom document. What matters: without a tone it sets no `data-state-tone`, so it reads its head's colours; with
 * one it carries its own; dashed and struck set their flags; fit sets `data-width`; and a label is text, never markup.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { ReactElement } from 'react';

import { StatePill } from './StatePill.tsx';

function renderedPill(pill: ReactElement): HTMLElement {
  const { container } = render(pill);
  const element = container.querySelector<HTMLElement>('.design-system-state-pill');
  if (element === null) throw new Error('no pill');
  return element;
}

afterEach(() => {
  cleanup();
});

describe('the state pill', () => {
  test('without a tone it sets no data-state-tone, no flag and no width, so it reads the head it sits in', () => {
    const pill = renderedPill(<StatePill label="In progress" />);
    expect([pill.hasAttribute('data-state-tone'), pill.hasAttribute('data-dashed'), pill.hasAttribute('data-struck'), pill.hasAttribute('data-width'), pill.textContent])
      .toEqual([false, false, false, false, 'In progress']);
  });

  test('with a tone it carries it, and fit sets data-width', () => {
    const pill = renderedPill(<StatePill label="Open" tone="neutral" width="fit" />);
    expect([pill.getAttribute('data-state-tone'), pill.getAttribute('data-width')]).toEqual(['neutral', 'fit']);
  });

  test('dashed and struck set their flags', () => {
    const pill = renderedPill(<StatePill label="Closed" dashed struck />);
    expect([pill.hasAttribute('data-dashed'), pill.hasAttribute('data-struck')]).toEqual([true, true]);
  });

  test('a label is text, never markup', () => {
    const pill = renderedPill(<StatePill label="<b>planted</b>" />);
    expect([pill.querySelector('b'), pill.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
