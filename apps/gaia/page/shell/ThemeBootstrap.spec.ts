/**
 * The theme before the first paint and after. What matters: the stored choice sets `data-theme` before anything renders, `auto` follows
 * the system, an unknown or unreadable stored value is `auto`; a choice is stored for the next first paint; and Gaia's settings win
 * only when a fleet document brings a new choice, so a choice made in the window is not undone by the next unrelated document.
 */
import { describe, expect, test } from 'bun:test';

import type { ThemeChoice }                                              from '../shared/@types/ThemeChoice.ts';
import { ThemeBootstrap, type ThemeChoiceState, type ThemeSurroundings } from './ThemeBootstrap.ts';

interface RecordedSurroundings extends ThemeSurroundings {
  readonly rootAttributes: Map<string, string>;
  readonly storedChoices:  ThemeChoice[];
}

function surroundingsWith(storedChoice: string | null, systemPrefersDark: boolean): RecordedSurroundings {
  const rootAttributes = new Map<string, string>();
  const storedChoices: ThemeChoice[] = [];
  return {
    rootAttributes,
    storedChoices,
    setRootAttribute:   (name, value) => rootAttributes.set(name, value),
    readStoredChoice:   () => storedChoice,
    storeChoice:        (choice) => storedChoices.push(choice),
    systemPrefersDark:  () => systemPrefersDark,
    followSystemScheme: () => () => undefined,
  };
}

describe('before the first paint', () => {
  test('a stored light or dark choice sets that theme whatever the system prefers', () => {
    const light = surroundingsWith('light', true);
    const dark = surroundingsWith('dark', false);
    expect([ThemeBootstrap.applyBeforeFirstPaint(light), ThemeBootstrap.applyBeforeFirstPaint(dark)]).toEqual(['light', 'dark']);
    expect([light.rootAttributes.get('data-theme'), dark.rootAttributes.get('data-theme')]).toEqual(['light', 'dark']);
  });

  test('auto, nothing stored and an unknown stored value each follow the system', () => {
    const cases = [surroundingsWith('auto', true), surroundingsWith(null, true), surroundingsWith('sepia', false)];
    expect(cases.map((surroundings) => ThemeBootstrap.applyBeforeFirstPaint(surroundings))).toEqual(['auto', 'auto', 'auto']);
    expect(cases.map((surroundings) => surroundings.rootAttributes.get('data-theme'))).toEqual(['dark', 'dark', 'light']);
  });

  test('reading the stored choice stores nothing', () => {
    const surroundings = surroundingsWith('dark', false);
    ThemeBootstrap.applyBeforeFirstPaint(surroundings);
    expect(surroundings.storedChoices).toEqual([]);
  });
});

describe('choosing a theme', () => {
  test('a choice is applied at once and kept for the next first paint', () => {
    const surroundings = surroundingsWith(null, false);
    ThemeBootstrap.chooseTheme(surroundings, 'dark');
    expect(surroundings.rootAttributes.get('data-theme')).toBe('dark');
    expect(surroundings.storedChoices).toEqual(['dark']);
  });
});

describe('the choice shown beside Gaia\'s settings', () => {
  const madeInTheWindow: ThemeChoiceState = { shown: 'light', documentChoice: 'dark' };

  test('the first document brings the settings\' choice in', () => {
    expect(ThemeBootstrap.themeStateAfterDocument({ shown: 'auto', documentChoice: null }, 'dark')).toEqual({ shown: 'dark', documentChoice: 'dark' });
  });

  test('a choice made in the window stands through a document that carries the same settings choice, as the very same state', () => {
    expect(ThemeBootstrap.themeStateAfterDocument(madeInTheWindow, 'dark')).toBe(madeInTheWindow);
    expect(ThemeBootstrap.themeStateAfterDocument(madeInTheWindow, null)).toBe(madeInTheWindow);
  });

  test('a new choice in the settings replaces the shown one', () => {
    expect(ThemeBootstrap.themeStateAfterDocument(madeInTheWindow, 'auto')).toEqual({ shown: 'auto', documentChoice: 'auto' });
  });

  test('choosing shows the choice and keeps the settings\' one; choosing the shown one changes nothing', () => {
    const state: ThemeChoiceState = { shown: 'dark', documentChoice: 'dark' };
    expect(ThemeBootstrap.themeStateAfterChoice(state, 'light')).toEqual({ shown: 'light', documentChoice: 'dark' });
    expect(ThemeBootstrap.themeStateAfterChoice(state, 'dark')).toBe(state);
  });
});
