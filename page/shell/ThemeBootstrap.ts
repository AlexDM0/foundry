/**
 * The theme on the document: set from the choice this browser last stored before the first paint, so no wrong theme flashes while
 * `gaia.css` keeps the body hidden until `data-theme` is set. `auto` follows the system's scheme. Gaia's settings hold the choice itself;
 * the stored copy only serves the first paint.
 */
import type { FleetDocumentThemeChoice } from '../@types/FleetDocument.ts';

export type ThemeChoice = FleetDocumentThemeChoice;

export type Theme = 'light' | 'dark';

/** Where the theme is applied, stored and read from the system, so a spec can drive each. */
export interface ThemeSurroundings {
  readonly setRootAttribute:   (name: string, value: string) => void;
  readonly readStoredChoice:   () => string | null;
  readonly storeChoice:        (choice: ThemeChoice) => void;
  readonly systemPrefersDark:  () => boolean;
  readonly followSystemScheme: (listener: () => void) => () => void;
}

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'auto';

const THEME_CHOICE_STORAGE_KEY = 'gaia-theme-choice';
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function themeChoiceOf(stored: string | null): ThemeChoice {
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : DEFAULT_THEME_CHOICE;
}

function themeOf(choice: ThemeChoice, systemPrefersDark: boolean): Theme {
  if (choice === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

function applyChoice(surroundings: ThemeSurroundings, choice: ThemeChoice): void {
  surroundings.setRootAttribute('data-theme', themeOf(choice, surroundings.systemPrefersDark()));
}

/** Applies the stored choice and answers it; a missing or unknown stored value is `auto`. */
function applyBeforeFirstPaint(surroundings: ThemeSurroundings): ThemeChoice {
  const choice = themeChoiceOf(surroundings.readStoredChoice());
  applyChoice(surroundings, choice);
  return choice;
}

/** Applies a choice and keeps it for the next first paint. */
function chooseTheme(surroundings: ThemeSurroundings, choice: ThemeChoice): void {
  surroundings.storeChoice(choice);
  applyChoice(surroundings, choice);
}

/** The choice the switch shows, and the choice of Gaia's settings that the newest fleet document carried. */
export interface ThemeChoiceState {
  readonly shown:          ThemeChoice;
  readonly documentChoice: ThemeChoice | null;
}

/**
 * The settings' choice is shown when a document brings a new one, the first document's included; a choice made in this window stands until
 * then. The same state comes back, the very object, when nothing changed, so a caller can tell.
 */
function themeStateAfterDocument(state: ThemeChoiceState, documentChoice: ThemeChoice | null): ThemeChoiceState {
  if (documentChoice === null || documentChoice === state.documentChoice) return state;
  return { shown: documentChoice, documentChoice };
}

function themeStateAfterChoice(state: ThemeChoiceState, choice: ThemeChoice): ThemeChoiceState {
  return choice === state.shown ? state : { ...state, shown: choice };
}

/** Storage may be absent or refuse, as in a locked-down profile: the choice is then not kept, and the page still themes itself. */
function browserThemeSurroundings(): ThemeSurroundings {
  return {
    setRootAttribute: (name, value) => document.documentElement.setAttribute(name, value),
    readStoredChoice: () => {
      try {
        return window.localStorage.getItem(THEME_CHOICE_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    storeChoice: (choice) => {
      try {
        window.localStorage.setItem(THEME_CHOICE_STORAGE_KEY, choice);
      } catch {
        // Nothing to keep the choice in; the page is themed all the same.
      }
    },
    systemPrefersDark:  () => window.matchMedia(DARK_SCHEME_QUERY).matches,
    followSystemScheme: (listener) => {
      const query = window.matchMedia(DARK_SCHEME_QUERY);
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
  };
}

export const ThemeBootstrap = {
  themeChoiceOf,
  themeOf,
  applyChoice,
  applyBeforeFirstPaint,
  chooseTheme,
  themeStateAfterDocument,
  themeStateAfterChoice,
  browserThemeSurroundings,
} as const;
