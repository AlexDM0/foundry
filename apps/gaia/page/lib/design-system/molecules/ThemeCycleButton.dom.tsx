/**
 * The theme cycle button, in a happy-dom document. What matters: the button carries the name and title the host words; a press hands the
 * next choice to onCycle, auto to light to dark and round; and its glyph is hidden, drawn for the current choice, with the half only for
 * auto.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ThemeChoice } from '../@types/ThemeChoice.ts';
import { ThemeCycleButton } from './ThemeCycleButton.tsx';

afterEach(() => {
  cleanup();
});

describe('the theme cycle button', () => {
  test('it carries the host\'s name and title, and a press hands on the next choice', () => {
    const cycled: ThemeChoice[] = [];
    for (const choice of ['auto', 'light', 'dark'] as const) {
      render(<ThemeCycleButton choice={choice} accessibleName={`Theme ${choice}`} onCycle={(next) => cycled.push(next)} />);
      const button = screen.getByRole('button', { name: `Theme ${choice}` });
      expect(button.getAttribute('title')).toBe(`Theme ${choice}`);
      fireEvent.click(button);
      cleanup();
    }
    expect(cycled).toEqual(['light', 'dark', 'auto']);
  });

  test('its glyph is hidden and drawn for the current choice, the half only for auto', () => {
    const glyphOf = (choice: ThemeChoice) => {
      render(<ThemeCycleButton choice={choice} accessibleName="Theme" onCycle={() => undefined} />);
      const glyph = screen.getByRole('button', { name: 'Theme' }).querySelector('svg');
      const reading = [glyph?.getAttribute('data-choice'), glyph?.getAttribute('aria-hidden'), glyph?.querySelectorAll('path').length];
      cleanup();
      return reading;
    };
    expect([glyphOf('auto'), glyphOf('light'), glyphOf('dark')]).toEqual([['auto', 'true', 1], ['light', 'true', 0], ['dark', 'true', 0]]);
  });
});
