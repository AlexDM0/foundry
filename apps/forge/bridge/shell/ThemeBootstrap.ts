/**
 * What the Bridge sets on the document before React's first paint: the theme from the stored choice or the system's, and the embedded
 * mark naming the program that frames it, agent-dashboard or Gaia. `board.css` keeps the body hidden until `data-theme` is set, so no wrong theme flashes.
 */
import type { PreferenceStore } from '../preferences/PreferenceStore.ts';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** The program framing the Bridge, as the literal `?embedded=` value names it. */
export type EmbeddingHost = 'dashboard' | 'gaia';

export const THEME_CHOICE_NAME = 'theme';
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'auto';
const EMBEDDING_HOSTS: readonly EmbeddingHost[] = ['dashboard', 'gaia'];
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

/** Only the literal `?embedded=dashboard` or `?embedded=gaia` marks the document embedded; `null` when it is not. */
function embeddingHostOf(search: string): EmbeddingHost | null {
  const named = new URLSearchParams(search).get('embedded');
  return EMBEDDING_HOSTS.find((host) => host === named) ?? null;
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

function applyBeforeFirstPaint(store: PreferenceStore, surroundings: DocumentSurroundings = browserSurroundings()): { embeddingHost: EmbeddingHost | null } {
  const choice = themeChoiceOf(store.readChoice(THEME_CHOICE_NAME));
  applyTheme(surroundings.root, themeOf(choice, surroundings.systemPrefersDark), choice);
  const embeddingHost = embeddingHostOf(surroundings.search);
  if (embeddingHost !== null) surroundings.root.setAttribute('data-embedded', embeddingHost);
  return { embeddingHost };
}

/** A viewer's choice, stored and applied at once. */
function chooseTheme(store: PreferenceStore, choice: ThemeChoice, surroundings: DocumentSurroundings = browserSurroundings()): void {
  store.writeChoice(THEME_CHOICE_NAME, choice, DEFAULT_THEME_CHOICE);
  applyTheme(surroundings.root, themeOf(choice, surroundings.systemPrefersDark), choice);
}

/** A theme choice the embedding parent sends: applied, never stored, since it is the framing program's choice and not this viewer's. */
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
