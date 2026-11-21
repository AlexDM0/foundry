/** The theme choices a theme cycle button steps through: auto, then light, then dark, and round to auto; and the choice a host stored. */
import type { ThemeChoice } from '../@types/ThemeChoice.ts';

const NEXT_CHOICES: Readonly<Record<ThemeChoice, ThemeChoice>> = { auto: 'light', light: 'dark', dark: 'auto' };
const UNSTORED_CHOICE: ThemeChoice = 'auto';

function nextChoiceOf(choice: ThemeChoice): ThemeChoice {
  return NEXT_CHOICES[choice];
}

/** The choice a host's stored value names; anything else, nothing stored included, is auto. */
function storedChoiceOf(storedValue: string | null): ThemeChoice {
  return storedValue === 'light' || storedValue === 'dark' ? storedValue : UNSTORED_CHOICE;
}

export const ThemeCycleUtil = { nextChoiceOf, storedChoiceOf } as const;
