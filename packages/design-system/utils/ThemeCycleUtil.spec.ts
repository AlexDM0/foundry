/**
 * The cycle's order and the stored choice. What matters: every choice steps to the next one, and three steps come back to where they
 * started; a stored light or dark is that choice, and anything else, nothing stored included, is auto.
 */
import { describe, expect, test } from 'bun:test';

import type { ThemeChoice } from '../@types/ThemeChoice.ts';
import { ThemeCycleUtil }   from './ThemeCycleUtil.ts';

const CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

describe('the theme cycle', () => {
  test('auto steps to light, light to dark and dark back to auto', () => {
    expect(CHOICES.map((choice) => ThemeCycleUtil.nextChoiceOf(choice))).toEqual(['light', 'dark', 'auto']);
  });

  test('three steps from any choice come back to it', () => {
    const threeStepsOn = (choice: ThemeChoice) => ThemeCycleUtil.nextChoiceOf(ThemeCycleUtil.nextChoiceOf(ThemeCycleUtil.nextChoiceOf(choice)));
    expect(CHOICES.map(threeStepsOn)).toEqual([...CHOICES]);
  });

  test('a stored light or dark is that choice, and auto, nothing stored or an unknown value is auto', () => {
    expect(['light', 'dark', 'auto', null, 'sepia'].map((storedValue) => ThemeCycleUtil.storedChoiceOf(storedValue))).toEqual(['light', 'dark', 'auto', 'auto', 'auto']);
  });
});
