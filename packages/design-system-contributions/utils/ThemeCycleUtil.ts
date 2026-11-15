/** The order a theme cycle button steps through: auto, then light, then dark, and round to auto. */
import type { ThemeChoice } from '../@types/ThemeChoice.ts';

const NEXT_CHOICES: Readonly<Record<ThemeChoice, ThemeChoice>> = { auto: 'light', light: 'dark', dark: 'auto' };

function nextChoiceOf(choice: ThemeChoice): ThemeChoice {
  return NEXT_CHOICES[choice];
}

export const ThemeCycleUtil = { nextChoiceOf } as const;
