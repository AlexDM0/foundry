/**
 * The header's one theme control: an icon button whose icon shows the choice, auto, light or dark, and whose press moves to the next one
 * in that order. Its name and title say the choice and what a click chooses.
 */
import { IconButton }        from 'design-system/IconButton';
import type { ReactElement } from 'react';

import type { ThemeChoice } from './ThemeBootstrap.ts';

export interface ThemeButtonProps {
  readonly themeChoice:   ThemeChoice;
  readonly onThemeChoice: (choice: ThemeChoice) => void;
}

const NEXT_THEME_CHOICE: Readonly<Record<ThemeChoice, ThemeChoice>> = { auto: 'light', light: 'dark', dark: 'auto' };

function themeButtonNameOf(choice: ThemeChoice): string {
  return `Theme: ${choice}. Click for ${NEXT_THEME_CHOICE[choice]}.`;
}

/** A disc half filled: the system's scheme. */
function AutoThemeIcon() {
  return (
    <svg className="bridge-theme-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path className="bridge-theme-icon-filled" d="M8 2.5 A5.5 5.5 0 0 1 8 13.5 Z" />
    </svg>
  );
}

function LightThemeIcon() {
  return (
    <svg className="bridge-theme-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5 V3 M8 13 V14.5 M1.5 8 H3 M13 8 H14.5 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M3.4 12.6 L4.5 11.5 M11.5 4.5 L12.6 3.4" />
    </svg>
  );
}

function DarkThemeIcon() {
  return (
    <svg className="bridge-theme-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 9.5 A5.5 5.5 0 1 1 6.5 3 A4.5 4.5 0 0 0 13 9.5 Z" />
    </svg>
  );
}

const ICON_OF_THEME_CHOICE: Readonly<Record<ThemeChoice, () => ReactElement>> = {
  auto:  AutoThemeIcon,
  light: LightThemeIcon,
  dark:  DarkThemeIcon,
};

export function ThemeButton({ themeChoice, onThemeChoice }: ThemeButtonProps) {
  const ChoiceIcon = ICON_OF_THEME_CHOICE[themeChoice];
  const name = themeButtonNameOf(themeChoice);
  return <IconButton drawing={<ChoiceIcon />} accessibleName={name} title={name} onPress={() => onThemeChoice(NEXT_THEME_CHOICE[themeChoice])} />;
}
