/**
 * The state pill, in a happy-dom document. What matters: without a state it sets no `data-state`, so it reads its head's colours; with
 * one it carries its own; fit sets `data-width`; and a label is text, never markup.
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
  const element = container.querySelector<HTMLElement>('.bridge-state-pill');
  if (element === null) throw new Error('no pill');
  return element;
}

afterEach(() => {
  cleanup();
});

describe('the state pill', () => {
  test('without a state it sets no data-state and no width, so it reads the head it sits in', () => {
    const pill = renderedPill(<StatePill label="In progress" />);
    expect([pill.hasAttribute('data-state'), pill.hasAttribute('data-width'), pill.textContent]).toEqual([false, false, 'In progress']);
  });

  test('with a state it carries it, and fit sets data-width', () => {
    const pill = renderedPill(<StatePill label="Open" state="paused" width="fit" />);
    expect([pill.getAttribute('data-state'), pill.getAttribute('data-width')]).toEqual(['paused', 'fit']);
  });

  test('a label is text, never markup', () => {
    const pill = renderedPill(<StatePill label="<b>planted</b>" />);
    expect([pill.querySelector('b'), pill.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
