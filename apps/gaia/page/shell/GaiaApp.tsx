/**
 * The page's root. `GaiaApp` follows the fleet document, the state of Gaia's event stream, the route in the fragment and the theme choice,
 * keeps the window title and the document's theme in step with them, picks the view the route names, and provides the command sender to the
 * views; `GaiaShell` lays out the brand bar across the window, the rail under it, and beside the rail the view's page title, the connection
 * banner and the view, from those values alone. While the stream is lost one disabled fieldset disables every button and field of the shell
 * and the view, so a view's control needs no word of the stream; a link, as every rail row is, still navigates.
 */
import { PageHead }       from 'design-system/PageHead';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { FleetDocument }                                            from '../@types/FleetDocument.ts';
import { type CommandSender, CommandSenderContext }                      from '../api/CommandSender.ts';
import { FleetStreamClient, type FleetStreamState }                      from '../api/FleetStreamClient.ts';
import { browserBoardServicesOf }                                        from '../board/Board.tsx';
import { BOARD_TAB_VIEWS }                                               from '../board/shell/BoardTabViews.tsx';
import { BrandBar }                                                      from '../design-system/BrandBar.tsx';
import type { ClockReading }                                             from '../shared/@types/ClockReading.ts';
import type { ThemeChoice }                                              from '../shared/@types/ThemeChoice.ts';
import type { ViewParts }                                                from '../shared/@types/ViewParts.ts';
import { type GaiaRoute, HashRouter, type HashSurroundings }             from '../shared/HashRouter.ts';
import { FigureLookUtil }                                                from '../shared/utils/FigureLookUtil.ts';
import { activityViewPartsOf }                                           from '../views/activity/ActivityView.tsx';
import { agentsViewPartsOf }                                             from '../views/agents/AgentsView.tsx';
import { attentionViewPartsOf }                                          from '../views/attention/AttentionView.tsx';
import { CrashLogRequest }                                               from '../views/forge/CrashLogRequest.ts';
import { type ForgeViewSurroundings, forgeViewPartsOf }                  from '../views/forge/ForgeView.tsx';
import { forgesViewPartsOf }                                             from '../views/forges/ForgesView.tsx';
import { BrandStatusModel }                                              from './BrandStatusModel.ts';
import { ConnectionBanner }                                              from './ConnectionBanner.tsx';
import type { FleetSource }                                              from './FleetSource.ts';
import { MotionReadiness }                                               from './MotionReadiness.ts';
import { PageClock }                                                     from './PageClock.ts';
import { Rail }                                                          from './Rail.tsx';
import { RailModel }                                                     from './RailModel.ts';
import { SecondsOnScreen }                                               from './SecondsOnScreen.ts';
import { type ThemeChoiceState, ThemeBootstrap, type ThemeSurroundings } from './ThemeBootstrap.ts';
import { WindowTitle }                                                   from './WindowTitle.ts';

export interface GaiaShellProps {
  readonly fleetDocument: FleetDocument | null;
  readonly streamState:   FleetStreamState;
  readonly route:         GaiaRoute;
  readonly view:          ViewParts;
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
  /** The page's clock, for a running time, an age or a clock time shown and never compared; it ticks while the page shows. */
  readonly clock:           PageClock;
  /** A forge's board: the board's services and views, the server's crash logs, and a tab of its own. */
  readonly forgeView:       ForgeViewSurroundings;
}

export interface GaiaAppProps {
  readonly fleetSource:   FleetSource;
  readonly fleetStream:   Pick<FleetStreamClient, 'state' | 'subscribe'>;
  readonly commandSender: CommandSender;
  readonly surroundings:  ShellSurroundings;
}

const NO_VIEW_PARTS: ViewParts = {
  title: null, lead: '', figures: [], actions: null, content: null
};

export interface ViewSurroundings {
  readonly readAtMilliseconds: number;
  /** The time zone a clock time is printed in; `undefined` is the browser's own. */
  readonly timeZone:           string | undefined;
  readonly goTo:               (fragment: string) => void;
  readonly forgeView:          ForgeViewSurroundings;
}

/** The parts of the view the route names; before the first fleet document a view shows at most its page title. */
export function viewPartsOf(route: GaiaRoute, fleetDocument: FleetDocument | null, {
  readAtMilliseconds, timeZone, goTo, forgeView
}: ViewSurroundings): ViewParts {
  const clock: ClockReading = { nowEpochMilliseconds: readAtMilliseconds, timeZone };
  switch (route.view) {
    case 'attention':
      return attentionViewPartsOf(fleetDocument, clock);
    case 'agents':
      return agentsViewPartsOf(fleetDocument, route, clock, goTo);
    case 'activity':
      return activityViewPartsOf(fleetDocument, clock);
    case 'forge':
      return forgeViewPartsOf(route, fleetDocument, clock, forgeView);
    case 'forges':
      return forgesViewPartsOf(fleetDocument, route, clock, goTo);
    default:
      return NO_VIEW_PARTS;
  }
}

/** A choice shows at once and goes to Gaia's settings, so the next fleet document carries it instead of bringing back the old one. */
export function themeChoiceHandlerOf(showChoice: (choice: ThemeChoice) => void, send: CommandSender['send']): (choice: ThemeChoice) => void {
  return (choice) => {
    showChoice(choice);
    void send({ kind: 'settings-set', key: 'theme', value: choice });
  };
}

/** A forge in place leaves the theme button out, so its bar has room for the forge's own line and buttons (D2). */
export function GaiaShell({
  fleetDocument, streamState, route, view, themeChoice, onThemeChoice
}: GaiaShellProps) {
  return (
    <div className="gaia-shell">
      <fieldset className="gaia-shell-controls" disabled={!FleetStreamClient.controlsMayActIn(streamState)}>
        <BrandBar
          status={BrandStatusModel.brandStatusOf(fleetDocument)}
          themeButton={route.view === 'forge' ? null : { choice: themeChoice, onCycle: onThemeChoice }}
        />
        <div className="gaia-shell-body">
          <Rail content={RailModel.railContentOf(fleetDocument, route)} />
          <main className="gaia-shell-main">
            {view.title === null ? null : (
              <div className="gaia-shell-page-title">
                <PageHead
                  title={view.title}
                  lead={view.lead}
                  figures={FigureLookUtil.pageHeadFiguresOf(view.figures)}
                  {...(view.actions === null ? {} : { actions: view.actions })}
                />
              </div>
            )}
            <ConnectionBanner streamState={streamState} />
            <div className="gaia-shell-view">{view.content}</div>
          </main>
        </div>
      </fieldset>
    </div>
  );
}

export function GaiaApp({
  fleetSource, fleetStream, commandSender, surroundings
}: GaiaAppProps) {
  const {
    hash, theme, setWindowTitle, markMotionReady, clock, forgeView
  } = surroundings;
  const fleetDocument = useSyncExternalStore(fleetSource.subscribe, fleetSource.current, fleetSource.current);
  const streamState = useSyncExternalStore(fleetStream.subscribe, fleetStream.state, fleetStream.state);
  const fragment = useSyncExternalStore(hash.followFragment, hash.currentFragment, hash.currentFragment);
  const route = useMemo(() => HashRouter.routeOf(fragment), [fragment]);
  const readAtMilliseconds = useSyncExternalStore(clock.subscribe, clock.now, clock.now);
  const secondsMayShow = SecondsOnScreen.secondsMayShowIn(route, fleetDocument);
  useEffect(() => (secondsMayShow ? clock.holdSecondTicks() : undefined), [clock, secondsMayShow]);

  const [themeState, setThemeState] = useState<ThemeChoiceState>(() => ({
    shown:          ThemeBootstrap.themeChoiceOf(theme.readStoredChoice()),
    documentChoice: null,
  }));
  const themeStateForDocument = ThemeBootstrap.themeStateAfterDocument(themeState, fleetDocument?.settings.theme ?? null);
  // Adjusting state while rendering, as React advises for a value derived from a changed input: no view shows the old theme.
  if (themeStateForDocument !== themeState) setThemeState(themeStateForDocument);
  const shownThemeChoice = themeStateForDocument.shown;
  const onThemeChoice = useMemo(() => themeChoiceHandlerOf(
    (choice) => setThemeState((state) => ThemeBootstrap.themeStateAfterChoice(state, choice)),
    commandSender.send,
  ), [commandSender]);

  useLayoutEffect(() => ThemeBootstrap.chooseTheme(theme, shownThemeChoice), [theme, shownThemeChoice]);
  useEffect(() => (shownThemeChoice === 'auto' ? theme.followSystemScheme(() => ThemeBootstrap.applyChoice(theme, 'auto')) : undefined), [theme, shownThemeChoice]);

  const windowTitle = WindowTitle.windowTitleOf(WindowTitle.viewTitleOf(route, fleetDocument), fleetDocument);
  useEffect(() => setWindowTitle(windowTitle), [setWindowTitle, windowTitle]);

  const motionMayStart = MotionReadiness.motionMayStartWith(fleetDocument);
  useEffect(() => {
    if (motionMayStart) markMotionReady();
  }, [markMotionReady, motionMayStart]);

  return (
    <CommandSenderContext value={commandSender}>
      <GaiaShell
        fleetDocument={fleetDocument}
        streamState={streamState}
        route={route}
        view={viewPartsOf(route, fleetDocument, {
          readAtMilliseconds,
          timeZone: clock.timeZone,
          goTo:     hash.goTo,
          forgeView,
        })}
        themeChoice={shownThemeChoice}
        onThemeChoice={onThemeChoice}
      />
    </CommandSenderContext>
  );
}

/** The page's one session loss arrives from the fleet stream, which the page makes after its surroundings. */
export interface ShellSessionSurroundings {
  readonly sessionWasLost: () => void;
}

export function browserShellSurroundings({ sessionWasLost }: ShellSessionSurroundings): ShellSurroundings {
  const hash = HashRouter.browserHashSurroundings();
  return {
    hash,
    theme:          ThemeBootstrap.browserThemeSurroundings(),
    setWindowTitle: (title) => {
      document.title = title;
    },
    markMotionReady: () => MotionReadiness.markReadyAfterNextPaint(MotionReadiness.browserMotionSurroundings()),
    clock:           PageClock.create(PageClock.browserSurroundings()),
    forgeView:       {
      requestCrashLog: (trackerId, crashLogNumber) => CrashLogRequest.requestCrashLog((path, requestOptions) => fetch(path, requestOptions), trackerId, crashLogNumber),
      boardServicesOf: (trackerId) => browserBoardServicesOf(trackerId, { goTo: hash.goTo, sessionWasLost }),
      boardTabViews:   BOARD_TAB_VIEWS,
      openInNewTab:    (fragment) => {
        window.open(`${window.location.origin}${window.location.pathname}${fragment}`, '_blank', 'noopener');
      },
    },
  };
}
