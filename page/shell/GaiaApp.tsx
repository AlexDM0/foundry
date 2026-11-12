/**
 * The page's root. `GaiaApp` follows the fleet document, the route in the fragment and the theme choice, and keeps the window title and
 * the document's theme in step with them; `GaiaShell` lays out the rail, the top bar and the view from those values alone.
 */
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { FleetDocument }                                from '../@types/FleetDocument.ts';
import type { FleetSource }                                  from './FleetSource.ts';
import { type GaiaRoute, HashRouter, type HashSurroundings } from './HashRouter.ts';
import { Rail }                                              from './Rail.tsx';
import { RailModel }                                         from './RailModel.ts';
import {
  type ThemeChoice,
  type ThemeChoiceState,
  ThemeBootstrap,
  type ThemeSurroundings,
} from './ThemeBootstrap.ts';
import { TopBar, type TopBarStatus } from './TopBar.tsx';
import { WindowTitle }               from './WindowTitle.ts';

/** What a view adds to the shell: the status line and buttons of the top bar, and the area under it. */
export interface ShellViewParts {
  readonly status:  TopBarStatus | null;
  readonly actions: ReactNode;
  readonly content: ReactNode;
}

export interface GaiaShellProps {
  readonly fleetDocument: FleetDocument | null;
  readonly route:         GaiaRoute;
  readonly viewTitle:     string;
  readonly view:          ShellViewParts;
  readonly themeChoice:   ThemeChoice;
  readonly onThemeChoice: (choice: ThemeChoice) => void;
}

/** The browser around the page, so a spec can stand in for each part. */
export interface ShellSurroundings {
  readonly hash:            HashSurroundings;
  readonly theme:           ThemeSurroundings;
  readonly setWindowTitle:  (title: string) => void;
  /** Lets motion run once the first fleet document has painted; until then every state shows at once. */
  readonly markMotionReady: () => void;
}

export interface GaiaAppProps {
  readonly fleetSource:  FleetSource;
  readonly surroundings: ShellSurroundings;
}

const NO_VIEW_PARTS: ShellViewParts = { status: null, actions: null, content: null };

export function GaiaShell({
  fleetDocument, route, viewTitle, view, themeChoice, onThemeChoice
}: GaiaShellProps) {
  return (
    <div className="gaia-shell">
      <Rail content={RailModel.railContentOf(fleetDocument, route)} />
      <main className="gaia-shell-main">
        <TopBar title={viewTitle} status={view.status} actions={view.actions} themeChoice={themeChoice} onThemeChoice={onThemeChoice} />
        <div className="gaia-shell-view">{view.content}</div>
      </main>
    </div>
  );
}

export function GaiaApp({ fleetSource, surroundings }: GaiaAppProps) {
  const {
    hash, theme, setWindowTitle, markMotionReady
  } = surroundings;
  const fleetDocument = useSyncExternalStore(fleetSource.subscribe, fleetSource.current, fleetSource.current);
  const fragment = useSyncExternalStore(hash.followFragment, hash.currentFragment, hash.currentFragment);
  const route = useMemo(() => HashRouter.routeOf(fragment), [fragment]);

  const [themeState, setThemeState] = useState<ThemeChoiceState>(() => ({
    shown:          ThemeBootstrap.themeChoiceOf(theme.readStoredChoice()),
    documentChoice: null,
  }));
  const themeStateForDocument = ThemeBootstrap.themeStateAfterDocument(themeState, fleetDocument?.settings.theme ?? null);
  // Adjusting state while rendering, as React advises for a value derived from a changed input: no frame shows the old theme.
  if (themeStateForDocument !== themeState) setThemeState(themeStateForDocument);
  const shownThemeChoice = themeStateForDocument.shown;
  const onThemeChoice = useCallback((choice: ThemeChoice) => setThemeState((state) => ThemeBootstrap.themeStateAfterChoice(state, choice)), []);

  useLayoutEffect(() => ThemeBootstrap.chooseTheme(theme, shownThemeChoice), [theme, shownThemeChoice]);
  useEffect(() => (shownThemeChoice === 'auto' ? theme.followSystemScheme(() => ThemeBootstrap.applyChoice(theme, 'auto')) : undefined), [theme, shownThemeChoice]);

  const viewTitle = WindowTitle.viewTitleOf(route, fleetDocument);
  const windowTitle = WindowTitle.windowTitleOf(viewTitle, fleetDocument);
  useEffect(() => setWindowTitle(windowTitle), [setWindowTitle, windowTitle]);

  const holdsADocument = fleetDocument !== null;
  useEffect(() => {
    if (holdsADocument) markMotionReady();
  }, [markMotionReady, holdsADocument]);

  return (
    <GaiaShell
      fleetDocument={fleetDocument}
      route={route}
      viewTitle={viewTitle}
      view={NO_VIEW_PARTS}
      themeChoice={shownThemeChoice}
      onThemeChoice={onThemeChoice}
    />
  );
}

export function browserShellSurroundings(): ShellSurroundings {
  return {
    hash:           HashRouter.browserHashSurroundings(),
    theme:          ThemeBootstrap.browserThemeSurroundings(),
    setWindowTitle: (title) => {
      document.title = title;
    },
    markMotionReady: () => document.documentElement.setAttribute('data-motion', 'ready'),
  };
}
