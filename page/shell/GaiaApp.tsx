/**
 * The page's root. `GaiaApp` follows the fleet document, the state of Gaia's event stream, the route in the fragment and the theme choice,
 * keeps the window title and the document's theme in step with them, remembers the view a forge in place was entered from, picks the view
 * the route names, and provides the command sender to the views; `GaiaShell` lays out the brand bar across the window, the rail under it,
 * and beside the rail the view's page title, the connection banner and the view, from those values alone. While the stream is lost one
 * disabled fieldset disables every button and field of the shell and the view, so a view's control needs no word of the stream; a link, as
 * every rail row is, still navigates.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { FleetDocument }                                 from '../@types/FleetDocument.ts';
import { type CommandSender, CommandSenderContext }           from '../api/CommandSender.ts';
import { FleetStreamClient, type FleetStreamState }           from '../api/FleetStreamClient.ts';
import { BrandBar }                                           from '../design-system/BrandBar.tsx';
import { PageTitle }                                          from '../design-system/PageTitle.tsx';
import type { ViewParts }                                     from '../shared/@types/ViewParts.ts';
import { activityViewPartsOf }                                from '../views/activity/ActivityView.tsx';
import { agentsViewPartsOf }                                  from '../views/agents/AgentsView.tsx';
import { attentionViewPartsOf }                               from '../views/attention/AttentionView.tsx';
import { EmbedChannel, type EmbedChannelSurroundings }        from '../views/forge-frame/EmbedChannel.ts';
import { ForgeFrameModel }                                    from '../views/forge-frame/ForgeFrameModel.ts';
import { type ForgeFrameSurroundings, forgeFrameViewPartsOf } from '../views/forge-frame/ForgeFrameView.tsx';
import { type FrameSessionResult, FrameSessionRequest }       from '../views/forge-frame/FrameSessionRequest.ts';
import { forgesViewPartsOf }                                  from '../views/forges/ForgesView.tsx';
import { BrandStatusModel }                                   from './BrandStatusModel.ts';
import { ConnectionBanner }                                   from './ConnectionBanner.tsx';
import type { FleetSource }                                   from './FleetSource.ts';
import { type GaiaRoute, HashRouter, type HashSurroundings }  from './HashRouter.ts';
import { MotionReadiness }                                    from './MotionReadiness.ts';
import { PageClock }                                          from './PageClock.ts';
import { Rail }                                               from './Rail.tsx';
import { RailModel }                                          from './RailModel.ts';
import {
  type ThemeChoice,
  type ThemeChoiceState,
  ThemeBootstrap,
  type ThemeSurroundings,
} from './ThemeBootstrap.ts';
import { WindowTitle } from './WindowTitle.ts';

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
  /** A forge in place: the server's frame sessions, and the messages its Bridge posts to the page. */
  readonly forgeFrame:      ShellForgeFrameSurroundings;
}

export interface ShellForgeFrameSurroundings {
  readonly requestFrameSession: (trackerId: string) => Promise<FrameSessionResult>;
  readonly embed:               EmbedChannelSurroundings;
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
  readonly forgeFrame:         ForgeFrameSurroundings;
}

/** The parts of the view the route names; before the first fleet document a view shows at most its page title. */
export function viewPartsOf(route: GaiaRoute, fleetDocument: FleetDocument | null, {
  readAtMilliseconds, timeZone, goTo, forgeFrame
}: ViewSurroundings): ViewParts {
  const clock = { nowEpochMilliseconds: readAtMilliseconds, timeZone };
  switch (route.view) {
    case 'attention':
      return attentionViewPartsOf(fleetDocument, clock);
    case 'agents':
      return agentsViewPartsOf(fleetDocument, route, clock, goTo);
    case 'activity':
      return activityViewPartsOf(fleetDocument, clock);
    case 'forge':
      return forgeFrameViewPartsOf(route, fleetDocument, clock, forgeFrame);
    case 'forges':
      return forgesViewPartsOf(fleetDocument, route, clock, goTo);
    default:
      return NO_VIEW_PARTS;
  }
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
                <PageTitle title={view.title} lead={view.lead} figures={view.figures} {...(view.actions === null ? {} : { actions: view.actions })} />
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
    hash, theme, setWindowTitle, markMotionReady, clock, forgeFrame
  } = surroundings;
  const fleetDocument = useSyncExternalStore(fleetSource.subscribe, fleetSource.current, fleetSource.current);
  const streamState = useSyncExternalStore(fleetStream.subscribe, fleetStream.state, fleetStream.state);
  const fragment = useSyncExternalStore(hash.followFragment, hash.currentFragment, hash.currentFragment);
  const route = useMemo(() => HashRouter.routeOf(fragment), [fragment]);
  const [leaveTarget, setLeaveTarget] = useState(() => ForgeFrameModel.initialLeaveTarget(route));
  const leaveTargetForRoute = ForgeFrameModel.leaveTargetAfter(leaveTarget, route);
  // Adjusting state while rendering, as React advises for a value derived from a changed input: the view sees the target of its own route.
  if (leaveTargetForRoute !== leaveTarget) setLeaveTarget(leaveTargetForRoute);
  const readAtMilliseconds = useSyncExternalStore(clock.subscribe, clock.now, clock.now);

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
          timeZone:   clock.timeZone,
          goTo:       hash.goTo,
          forgeFrame: {
            ...forgeFrame,
            replaceFragment: hash.replaceFragment,
            goTo:            hash.goTo,
            leaveFragment:   leaveTargetForRoute.fragment,
            themeChoice:     shownThemeChoice,
          },
        })}
        themeChoice={shownThemeChoice}
        onThemeChoice={onThemeChoice}
      />
    </CommandSenderContext>
  );
}

export function browserShellSurroundings(): ShellSurroundings {
  return {
    hash:           HashRouter.browserHashSurroundings(),
    theme:          ThemeBootstrap.browserThemeSurroundings(),
    setWindowTitle: (title) => {
      document.title = title;
    },
    markMotionReady: () => MotionReadiness.markReadyAfterNextPaint(MotionReadiness.browserMotionSurroundings()),
    clock:           PageClock.create(PageClock.browserSurroundings()),
    forgeFrame:      {
      requestFrameSession: (trackerId) => FrameSessionRequest.requestFrameSession((path, requestOptions) => fetch(path, requestOptions), trackerId),
      embed:               EmbedChannel.browserSurroundings(),
    },
  };
}
