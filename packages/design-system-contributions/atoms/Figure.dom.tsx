/**
 * The figure, in a happy-dom document. What matters: the value and its words both read; stacked is the default form and inline is asked
 * for; and a tone reaches the figure as its state tone, with none set by default.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Figure } from './Figure.tsx';

afterEach(() => {
  cleanup();
});

describe('the figure', () => {
  test('its value and its words both read, stacked by default', () => {
    render(<Figure value="12" label="agents running" />);
    const figure = screen.getByText('12').parentElement;
    expect([figure?.textContent, figure?.getAttribute('data-form'), figure?.hasAttribute('data-state-tone')]).toEqual(['12agents running', 'stacked', false]);
  });

  test('an inline figure and a toned one are marked', () => {
    render(<Figure value="3" label="waiting" form="inline" tone="accent" />);
    const figure = screen.getByText('waiting').parentElement;
    expect([figure?.getAttribute('data-form'), figure?.getAttribute('data-state-tone')]).toEqual(['inline', 'accent']);
  });
});
