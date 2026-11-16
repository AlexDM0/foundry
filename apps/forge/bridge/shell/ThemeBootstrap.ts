/**
 * What the Bridge sets on the document before React's first paint: the theme from the stored choice or the system's, and the embed mode
 * when a framing page opened it so. `board.css` keeps the body hidden until `data-theme` is set, so no wrong theme flashes.
 */
import { EMBED_MODE_QUERY } from 'forge-contracts/EmbedMode';

import type { PreferenceStore } from '../preferences/PreferenceStore.ts';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** The one embed mode, which names no framing page. */
export type EmbedMode = typeof EMBED_MODE_QUERY.value;

export const THEME_CHOICE_NAME = 'theme';
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'auto';
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHOICE_ATTRIBUTE = 'data-theme-choice';

export interface DocumentSurroundings {
  readonly root:                 HTMLElement;
  readonly search:               string;
  readonly systemPrefersDark:    () => boolean;
  /** Calls `onChange` each time the system's scheme changes; returns the stop. */
  readonly onSystemSchemeChange: (onChange: () => void) => () => void;
}

function themeChoiceOf(stored: string | null): ThemeChoice {
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME_CHOICE;
}

function themeOf(choice: ThemeChoice, systemPrefersDark: () => boolean): Theme {
  if (choice === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return choice;
}

function applyTheme(root: HTMLElement, theme: Theme, choice: ThemeChoice): void {
  root.setAttribute('data-theme', theme);
  root.setAttribute(THEME_CHOICE_ATTRIBUTE, choice);
}

/** Only the literal `?embedded=frame` marks the document embedded; `null` when it is not. */
function embedModeOf(search: string): EmbedMode | null {
  return new URLSearchParams(search).get(EMBED_MODE_QUERY.parameter) === EMBED_MODE_QUERY.value ? EMBED_MODE_QUERY.value : null;
}

function browserSurroundings(): DocumentSurroundings {
  return {
    root:                 document.documentElement,
    search:               window.location.search,
    systemPrefersDark:    () => window.matchMedia(DARK_SCHEME_QUERY).matches,
    onSystemSchemeChange: (onChange) => {
      const query = window.matchMedia(DARK_SCHEME_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
  };
}

function applyBeforeFirstPaint(store: PreferenceStore, surroundings: DocumentSurroundings = browserSurroundings()): { embedMode: EmbedMode | null } {
  const choice = themeChoiceOf(store.readChoice(THEME_CHOICE_NAME));
  applyTheme(surroundings.root, themeOf(choice, surroundings.systemPrefersDark), choice);
  const embedMode = embedModeOf(surroundings.search);
  if (embedMode !== null) surroundings.root.setAttribute('data-embedded', embedMode);
  return { embedMode };
}

/** A viewer's choice, stored and applied at once. */
function chooseTheme(store: PreferenceStore, choice: ThemeChoice, surroundings: DocumentSurroundings = browserSurroundings()): void {
  store.writeChoice(THEME_CHOICE_NAME, choice, DEFAULT_THEME_CHOICE);
  applyTheme(surroundings.root, themeOf(choice, surroundings.systemPrefersDark), choice);
}

/** A theme choice the framing page sends: applied, never stored, since it is the framing page's choice and not this viewer's. */
function applyParentTheme(choice: ThemeChoice, surroundings: DocumentSurroundings = browserSurroundings()): void {
  applyTheme(surroundings.root, themeOf(choice, surroundings.systemPrefersDark), choice);
}

/** While the choice on the root is `auto`, whoever made it, a change of the system's scheme applies the theme again; returns the stop. */
function followSystemScheme(surroundings: DocumentSurroundings = browserSurroundings()): () => void {
  return surroundings.onSystemSchemeChange(() => {
    if (surroundings.root.getAttribute(THEME_CHOICE_ATTRIBUTE) !== 'auto') return;
    applyTheme(surroundings.root, themeOf('auto', surroundings.systemPrefersDark), 'auto');
  });
}

export const ThemeBootstrap = Object.freeze({
  applyBeforeFirstPaint, chooseTheme, applyParentTheme, followSystemScheme, themeChoiceOf,
});
