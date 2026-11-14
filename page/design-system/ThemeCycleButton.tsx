/**
 * The brand bar's theme button (COMPONENT_LIBRARY 3.4): the package's 30 px icon button with the glyph of the current choice, which a press
 * moves on to the next, auto to light to dark and round. Its accessible name says the current choice and the next, as "Theme: auto. Switch
 * to light". The glyph is a circle, its right half filled for auto, open for light and filled for dark.
 */
import { IconButton } from 'design-system/IconButton';

export type ThemeCycleChoice = 'auto' | 'light' | 'dark';

const NEXT_CHOICES: Readonly<Record<ThemeCycleChoice, ThemeCycleChoice>> = { auto: 'light', light: 'dark', dark: 'auto' };

export interface ThemeCycleButtonProps {
  readonly choice:  ThemeCycleChoice;
  readonly onCycle: (next: ThemeCycleChoice) => void;
}

export function nextThemeChoiceOf(choice: ThemeCycleChoice): ThemeCycleChoice {
  return NEXT_CHOICES[choice];
}

export function themeCycleNameOf(choice: ThemeCycleChoice): string {
  return `Theme: ${choice}. Switch to ${nextThemeChoiceOf(choice)}`;
}

function ThemeGlyph({ choice }: { readonly choice: ThemeCycleChoice }) {
  return (
    <svg className="gaia-theme-glyph" data-choice={choice} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      {choice === 'auto' ? <path className="gaia-theme-glyph-half" d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" /> : null}
    </svg>
  );
}

export function ThemeCycleButton({ choice, onCycle }: ThemeCycleButtonProps) {
  const name = themeCycleNameOf(choice);
  return <IconButton drawing={<ThemeGlyph choice={choice} />} accessibleName={name} title={name} onPress={() => onCycle(nextThemeChoiceOf(choice))} />;
}
