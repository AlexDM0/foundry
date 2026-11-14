/**
 * The theme button. What matters: it is the package's icon button; a press hands on the next choice, auto to light to dark and back to
 * auto; its accessible name and tooltip say the current choice and the next; its glyph is hidden and differs for each choice (a half-filled
 * circle for auto, open for light, filled for dark), each with its rule.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import {
  nextThemeChoiceOf,
  ThemeCycleButton,
  type ThemeCycleChoice,
  themeCycleNameOf
} from './ThemeCycleButton.tsx';

function buttonOf(choice: ThemeCycleChoice, cycled: ThemeCycleChoice[]) {
  return ReactElementTree.unfolded(<ThemeCycleButton choice={choice} onCycle={(next) => cycled.push(next)} />);
}

describe('the theme button', () => {
  test('a press cycles auto, light, dark and back to auto', () => {
    const cycled: ThemeCycleChoice[] = [];
    for (const choice of ['auto', 'light', 'dark'] as const) ReactElementTree.dispatch(ReactElementTree.onlyWithTag(buttonOf(choice, cycled), 'button'), 'onClick');
    expect(cycled).toEqual(['light', 'dark', 'auto']);
    expect(['auto', 'light', 'dark'].map((choice) => nextThemeChoiceOf(choice as ThemeCycleChoice))).toEqual(['light', 'dark', 'auto']);
  });

  test('its name and tooltip say the current choice and the next', () => {
    const button = ReactElementTree.onlyWithTag(buttonOf('auto', []), 'button');
    expect([button.props['className'], button.props['aria-label'], button.props['title']])
      .toEqual(['design-system-icon-button', 'Theme: auto. Switch to light', 'Theme: auto. Switch to light']);
    expect(themeCycleNameOf('light')).toBe('Theme: light. Switch to dark');
    expect(themeCycleNameOf('dark')).toBe('Theme: dark. Switch to auto');
  });

  test('the glyph is hidden: half filled for auto, open for light and filled for dark', () => {
    const glyphOf = (choice: ThemeCycleChoice) => ReactElementTree.onlyWithClass(buttonOf(choice, []), 'gaia-theme-glyph');
    expect(glyphOf('auto').props['aria-hidden']).toBe('true');
    expect(['auto', 'light', 'dark'].map((choice) => glyphOf(choice as ThemeCycleChoice).props['data-choice'])).toEqual(['auto', 'light', 'dark']);
    expect(ReactElementTree.hostElementsIn(buttonOf('auto', []), ReactElementTree.withClass('gaia-theme-glyph-half'))).toHaveLength(1);
    expect(ReactElementTree.hostElementsIn(buttonOf('light', []), ReactElementTree.withClass('gaia-theme-glyph-half'))).toEqual([]);
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-theme-glyph', 'data-choice', 'dark')).toBe(true);
  });
});
