/**
 * A forge's board, the root of `#forge/<trackerId>[/<tab>[/<item>]]` (SCREENS B1), the one way a board opens (decision 43). Gaia's bar heads
 * it, then the board's own header and tabs for every tab, then the main area: a tab Gaia's board draws is drawn there by its view, and any
 * other shows the forge's own Bridge in a frame, its head hidden, kept in one frame session per Overseer: a new address or a new start of
 * the forge's Overseer, as the fleet document reports it, mounts a new one. A forge Gaia cannot read shows why in place of the board. The
 * bar reads the command sender and keeps the Stop question's state; its Wake, its Stop for Flint's brain and the forge mark's double click
 * send the brain's commands for this forge alone, and its Open in new tab opens the same route of Gaia's own address in a new tab. The view
 * heads itself with the forge's bar, so `forgeViewPartsOf` hands the shell no page title. A new fleet document changes both at once.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { CommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { FleetDocument }                from '../../@types/FleetDocument.ts';
import { CommandSender, useCommandSender }   from '../../api/CommandSender.ts';
import { Board, type BoardServicesOf }       from '../../board/Board.tsx';
import type { BoardRoute }                   from '../../board/shell/BoardRouter.ts';
import type { BoardTabViewTable }            from '../../board/shell/BoardTabViews.tsx';
import type { ClockReading }                 from '../../shared/@types/ClockReading.ts';
import type { ThemeChoice }                  from '../../shared/@types/ThemeChoice.ts';
import type { ViewParts }                    from '../../shared/@types/ViewParts.ts';
import { HashRouter }                        from '../../shared/HashRouter.ts';
import { ForgeContractUtil }                 from '../../shared/utils/ForgeContractUtil.ts';
import type { EmbedChannelSurroundings }     from './EmbedChannel.ts';
import {
  BarRefusalLine,
  ForgeBarControls,
  ForgeBarLayout,
  type FrameAreaShown,
  ForgeFrameAreaLayout,
  forgeMarkPropsOf,
} from './ForgeFrameLayout.tsx';
import {
  type ForgeBar,
  type ForgeFrameArea,
  type ForgeFrameContent,
  ForgeFrameModel,
} from './ForgeFrameModel.ts';
import { ForgeFrameSession, type ForgeFrameState } from './ForgeFrameSession.ts';
import type { FrameSessionResult }                 from './FrameSessionRequest.ts';

/** What the page around a forge's board hands it: the server's frame sessions, the page's messages, its address and its theme, the board. */
export interface ForgeViewSurroundings {
  readonly requestFrameSession: (trackerId: string) => Promise<FrameSessionResult>;
  readonly embed:               EmbedChannelSurroundings;
  readonly replaceFragment:     (fragment: string) => void;
  readonly goTo:                (fragment: string) => void;
  /** The fragment of the view Gaia came from, where `leave` goes. */
  readonly leaveFragment:       string;
  readonly themeChoice:         ThemeChoice;
  readonly boardServicesOf:     BoardServicesOf;
  /** The tabs Gaia's board draws itself; every other tab shows the frame. */
  readonly boardTabViews:       BoardTabViewTable;
  /** Opens Gaia's own address at a fragment in a browser tab of its own. */
  readonly openInNewTab:        (fragment: string) => void;
}

/** The forge view's route: the forge, and the board route Gaia's address names. */
export interface ForgeViewRoute {
  readonly trackerId:  string;
  readonly boardRoute: BoardRoute | null;
}

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

function shownOf(state: ForgeFrameState): FrameAreaShown {
  switch (state.phase) {
    case 'asking':
      return { kind: 'opening' };
    case 'opened':
      return {
        kind: 'frame', frameUrl: state.frameUrl, frameLoad: state.frameLoad, bridgeIsReady: state.bridgeIsReady,
      };
    case 'not-supported':
      return { kind: 'cannot-show' };
    case 'unreachable':
      return { kind: 'unreachable' };
    case 'refused':
      return { kind: 'refused', refusal: ForgeFrameModel.frameSessionRefusalTextOf(state.refusal, state.text) };
  }
}

interface ForgeBarWithControlsProps {
  readonly bar:            ForgeBar;
  readonly onOpenInNewTab: () => void;
}

function ForgeBarWithControls({ bar, onOpenInNewTab }: ForgeBarWithControlsProps) {
  const {
    send, dismissFailure, dismissRestartPending, states
  } = useCommandSender();
  const [stopIsOpen, setStopIsOpen] = useState(false);
  const [stopAgents, setStopAgents] = useState<ForgeStopAgents>('keep');
  const stopAnchorRef = useRef<HTMLSpanElement | null>(null);
  const commandState = CommandSender.stateOf(states, { trackerId: bar.trackerId });
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const brainShown = bar.brain === null ? null : ForgeFrameModel.brainShownAfter(bar.brain, commandState.failure);
  const wakeRefusalIsOutOfDate = ForgeFrameModel.brainWakeRefusalIsOutOfDate(bar.brain, commandState.failure);
  useEffect(() => {
    if (wakeRefusalIsOutOfDate) dismissFailure({ trackerId: bar.trackerId });
  }, [wakeRefusalIsOutOfDate, dismissFailure, bar.trackerId]);
  const markWake = ForgeFrameModel.markWakeOf(bar.brain, brainShown);
  const wakeBrain = (): void => void send({ kind: 'forge-brain-start', trackerId: bar.trackerId });
  const updateStep = ForgeFrameModel.updateStepOf(commandState);
  const subject = { trackerId: bar.trackerId };
  return (
    <ForgeBarLayout
      name={bar.project}
      status={bar.status}
      mark={forgeMarkPropsOf(markWake, commandIsOnItsWay, wakeBrain)}
      controls={(
        <ForgeBarControls
          bar={bar}
          brainShown={brainShown}
          commandIsOnItsWay={commandIsOnItsWay}
          stopIsOpen={stopIsOpen}
          stopAnchorRef={stopAnchorRef}
          stopAgents={stopAgents}
          onCommand={(command) => {
            if (command.kind === 'forge-stop') setStopIsOpen(false);
            void send(command);
          }}
          onOpenStop={() => {
            setStopAgents('keep');
            setStopIsOpen((isOpen) => !isOpen);
          }}
          onChooseStop={setStopAgents}
          onCancelStop={() => setStopIsOpen(false)}
          updateStep={updateStep}
          onDismissUpdate={() => (updateStep.step === 'refused' ? dismissFailure(subject) : dismissRestartPending(subject))}
          onOpenInNewTab={onOpenInNewTab}
        />
      )}
    />
  );
}

interface FramedForgeProps {
  readonly area:              Extract<ForgeFrameArea, { kind: 'frame' }>;
  readonly boardRoute:        BoardRoute;
  readonly surroundings:      ForgeViewSurroundings;
  readonly commandIsOnItsWay: boolean;
  readonly onOpenInNewTab:    () => void;
}

/** One frame session, for as long as the same Overseer serves the forge; its key in the parent is the forge and its Overseer. */
function FramedForge({
  area, boardRoute, surroundings, commandIsOnItsWay, onOpenInNewTab
}: FramedForgeProps) {
  const {
    requestFrameSession, embed, replaceFragment, goTo, leaveFragment, themeChoice
  } = surroundings;
  const leave = useCallback(() => goTo(leaveFragment), [goTo, leaveFragment]);
  const [session] = useState(() => ForgeFrameSession.create(
    { trackerId: area.trackerId, boardRoute, themeChoice },
    {
      requestFrameSession, embed, replaceFragment, leave,
    },
  ));
  const state = useSyncExternalStore(session.subscribe, session.state, session.state);
  useEffect(() => session.start(), [session]);
  useEffect(() => session.routeChanged(boardRoute), [session, boardRoute]);
  useEffect(() => session.themeChanged(themeChoice), [session, themeChoice]);
  const onFrameElement = useCallback((element: HTMLIFrameElement | null) => {
    const frameWindow = element?.contentWindow ?? null;
    return frameWindow === null ? undefined : session.attachFrame(frameWindow);
  }, [session]);
  return (
    <ForgeFrameAreaLayout
      area={area}
      shown={shownOf(state)}
      onFrameElement={onFrameElement}
      onLookAgain={session.askAgain}
      onAskAgain={session.askAgain}
      onLeave={leave}
      onOpenInNewTab={onOpenInNewTab}
      commandIsOnItsWay={commandIsOnItsWay}
    />
  );
}

/** The areas the board's header and tabs stand over, for a forge whose board can be read through Gaia's relay. */
function boardIsShownFor(area: ForgeFrameArea): area is Extract<ForgeFrameArea, { kind: 'frame' | 'unreachable' | 'cannot-show' }> {
  return area.kind === 'frame' || area.kind === 'unreachable' || area.kind === 'cannot-show';
}

interface ForgeContentViewProps {
  readonly content:        ForgeFrameContent;
  /** Whether Gaia's relay can read the forge's board, as last reported included. */
  readonly boardCanBeRead: boolean;
  readonly route:          ForgeViewRoute;
  readonly surroundings:   ForgeViewSurroundings;
}

/**
 * The frame is drawn only for a tab no view of the board draws, at the route the board shows. The Bridge's own Open in new tab, for a forge
 * whose Bridge cannot be framed, runs the forge program as it does today.
 */
function ForgeContentView({
  content, boardCanBeRead, route, surroundings
}: ForgeContentViewProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const { area } = content;
  const subject = { trackerId: area.trackerId };
  const commandState = CommandSender.stateOf(states, subject);
  const refusal = ForgeFrameModel.barRefusalOf(area.trackerId, commandState.failure, content.bar?.cannotTalk?.verdict === 'older');
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const sendCommand = (command: CommandBody): void => void send(command);
  const openTheForgesBridge = (): void => sendCommand({ kind: 'forge-open-in-browser', trackerId: area.trackerId });
  const areaLayoutOf = (shownArea: ForgeFrameArea) => (
    <ForgeFrameAreaLayout
      area={shownArea}
      shown={null}
      onFrameElement={null}
      onLookAgain={() => sendCommand(LOOK_AGAIN)}
      onAskAgain={() => sendCommand(LOOK_AGAIN)}
      onLeave={() => surroundings.goTo(surroundings.leaveFragment)}
      onOpenInNewTab={openTheForgesBridge}
      commandIsOnItsWay={commandIsOnItsWay}
    />
  );
  const unmovedTabArea = (shownRoute: BoardRoute) => (area.kind === 'frame'
    ? (
      <FramedForge
        key={`${area.trackerId} ${area.overseerKey}`}
        area={area}
        boardRoute={shownRoute}
        surroundings={surroundings}
        commandIsOnItsWay={commandIsOnItsWay}
        onOpenInNewTab={openTheForgesBridge}
      />
    )
    : areaLayoutOf(area));
  return (
    <div className="gaia-forge-frame">
      {refusal === null ? null : <BarRefusalLine refusal={refusal} onCommand={sendCommand} onDismiss={() => dismissFailure(subject)} />}
      {boardCanBeRead && boardIsShownFor(area)
        ? (
          <Board
            trackerId={area.trackerId}
            route={route.boardRoute}
            project={area.project}
            servicesOf={surroundings.boardServicesOf}
            tabViews={surroundings.boardTabViews}
            unmovedTabArea={unmovedTabArea}
          />
        )
        : areaLayoutOf(area)}
    </div>
  );
}

/**
 * Before the first fleet document the bar names the forge by its tracker id and the view shows nothing more: Gaia does not yet know whether
 * the forge's board can be read.
 */
export function forgeViewPartsOf(route: ForgeViewRoute, fleetDocument: FleetDocument | null, clock: ClockReading, surroundings: ForgeViewSurroundings): ViewParts {
  const selfHeaded = {
    title: null, lead: '', figures: [], actions: null
  } as const;
  if (fleetDocument === null) {
    return { ...selfHeaded, content: <div className="gaia-forge-frame-view"><ForgeBarLayout name={route.trackerId} status={null} mark={{}} controls={null} /></div> };
  }
  const content = ForgeFrameModel.forgeFrameContentOf(route.trackerId, fleetDocument, clock);
  const { bar } = content;
  const forge = fleetDocument.forges.find((candidate) => candidate.trackerId === route.trackerId);
  const boardCanBeRead = forge !== undefined && ForgeContractUtil.canOpenInPlace(forge);
  const openRouteInNewTab = (): void => surroundings.openInNewTab(HashRouter.fragmentOf({ view: 'forge', ...route }));
  return {
    ...selfHeaded,
    content: (
      <div className="gaia-forge-frame-view">
        {bar === null
          ? <ForgeBarLayout name={route.trackerId} status={null} mark={{}} controls={null} />
          : <ForgeBarWithControls key={bar.trackerId} bar={bar} onOpenInNewTab={openRouteInNewTab} />}
        <ForgeContentView content={content} boardCanBeRead={boardCanBeRead} route={route} surroundings={surroundings} />
      </div>
    ),
  };
}
