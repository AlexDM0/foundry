/**
 * The board's shell for one forge: it reads the board through Gaia's relay at the start, after each `board-changed` and after its stream
 * comes back, follows the stream's connection, says whether controls may act, and draws the banners, the incident line, the header with its
 * tabs, and the main area. A tab `BOARD_TAB_VIEWS` lists is drawn by its view; any other tab's main area is what the forge view puts there,
 * the forge's own Bridge in a frame. It navigates by Gaia's address alone, through `services.goTo`, and provides the tracker id and the way
 * to go to every link below it. Flint lives over the whole board, its habitat stored with the board's preferences.
 */
import { EmptyState } from 'design-system/EmptyState';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { BoardDocument }                                      from '../../@types/board/BoardDocument.ts';
import type { BoardServices }                                      from '../@types/BoardServices.ts';
import type { ConnectionState }                                    from '../api/BoardEventStreamClient.ts';
import { BoardFlint }                                              from '../flint/BoardFlint.tsx';
import type { BoardReading }                                       from '../flint/BoardOccasionModel.ts';
import { boardPreferenceStoreOf }                                  from '../preferences/PreferenceStore.ts';
import { TimeUtil }                                                from '../utils/TimeUtil.ts';
import { BROWSER_BOARD_CLOCK, BoardClockContext, type BoardClock } from './BoardClock.ts';
import { BoardGoToContext, BoardTrackerContext }                   from './BoardRouteLinks.ts';
import {
  BoardRouter,
  DEFAULT_TAB,
  TAB_CHOICE_NAME,
  type BoardRoute,
  type BoardTab
} from './BoardRouter.ts';
import { BoardStateUpdate }                                                              from './BoardStateUpdate.ts';
import { BOARD_TAB_VIEWS, type BoardTabViewTable }                                       from './BoardTabViews.tsx';
import { ConnectionBanners }                                                             from './ConnectionBanners.tsx';
import { ControlAvailabilityUtil, ControlSurroundingsContext, type ControlSurroundings } from './ControlAvailability.ts';
import { Header }                                                                        from './Header.tsx';
import { headerModelOf }                                                                 from './HeaderModel.ts';
import { IncidentNotice }                                                                from './IncidentNotice.tsx';
import { IncidentNoticeModelUtil }                                                       from './IncidentNoticeModel.ts';
import { WaitingOnUserModel }                                                            from './WaitingOnUserModel.ts';

export interface BoardAppProps {
  readonly services:       BoardServices;
  /** The route Gaia's address names; `null` for the forge alone, which opens the tab stored for this board. */
  readonly route:          BoardRoute | null;
  /** The forge's name until the first board names it. */
  readonly project:        string;
  /** What the main area holds for a tab no view of the board draws yet, for the route shown. */
  readonly unmovedTabArea: (route: BoardRoute) => ReactNode;
  /** The tabs the board draws itself; `BOARD_TAB_VIEWS` unless a spec hands its own. */
  readonly tabViews?:      BoardTabViewTable;
}

const HELD_BY_INSTALL_CHANGE = 'held-by-install-change';

/** The board's preference holding the incident defaults this viewer marked seen. */
const SEEN_INCIDENT_DEFAULTS_CHOICE_NAME = 'seen-incident-defaults';

const WAITING_FOR_THE_FIRST_BOARD = 'Waiting for the forge\'s first board.';

function connectionIsLost(connection: ConnectionState): boolean {
  return connection === 'down' || connection === 'no-session';
}

function shownTabsOfBoard(board: BoardDocument | null): BoardTab[] {
  if (board === null) return BoardRouter.shownTabsOf(null, null, null);
  return BoardRouter.shownTabsOf(
    board.page.tickets.some((ticket) => ticket.dependsOn.length > 0),
    board.page.facts.epics.length > 0,
    board.pipeline.applied.readingVerdict === 'readable',
  );
}

/** Reads the board at the start, after each `board-changed`, and once the stream is live again after it was lost; a later read wins. */
function useBoardReading(services: BoardServices): {
  readonly board:          BoardDocument | null;
  readonly connection:     ConnectionState;
  readonly boardShownAsOf: string | null;
} {
  const [board, setBoard] = useState<BoardDocument | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [boardShownAsOf, setBoardShownAsOf] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;
    let readNumber = 0;
    let streamWasLost = false;
    const readAgain = (): void => {
      readNumber += 1;
      const thisRead = readNumber;
      void services.readBoard().then((read) => {
        if (!isMounted || thisRead !== readNumber) return;
        setBoard((previous) => BoardStateUpdate.boardAfterRead(previous, read));
        if (read.verdict === 'read') setBoardShownAsOf(services.now().toLocaleString());
      });
    };
    readAgain();
    const stream = services.openEventStream({
      onEvent: (event) => {
        if (BoardStateUpdate.readIsDueAfter(event)) readAgain();
      },
      onConnection: (state) => {
        setConnection(state);
        if (connectionIsLost(state)) streamWasLost = true;
        if (state !== 'live' || !streamWasLost) return;
        streamWasLost = false;
        readAgain();
      },
    });
    return () => {
      isMounted = false;
      stream.close();
    };
  }, [services]);
  return { board, connection, boardShownAsOf };
}

export function BoardApp({
  services, route, project, unmovedTabArea, tabViews = BOARD_TAB_VIEWS
}: BoardAppProps) {
  const { board, connection, boardShownAsOf } = useBoardReading(services);
  const boardStore = useMemo(() => boardPreferenceStoreOf(services.trackerId, services.storage), [services]);
  const [installRefusal, setInstallRefusal] = useState<string | null>(null);
  const [sessionIsLost, setSessionIsLost] = useState(false);
  const [refusedCommandCount, setRefusedCommandCount] = useState(0);
  const countRefusal = useCallback(() => setRefusedCommandCount((counted) => counted + 1), []);
  const loseSession = useCallback(() => setSessionIsLost(true), []);
  const mainPanelRef = useRef<HTMLElement | null>(null);

  const boardIsHeld = board?.overseer.state === HELD_BY_INSTALL_CHANGE;
  const [refusalBoard, setRefusalBoard] = useState(board);
  // Adjusting state while rendering, as React advises for a value derived from a changed input: a board no longer held clears the 423.
  if (refusalBoard !== board) {
    setRefusalBoard(board);
    if (board !== null && !boardIsHeld) setInstallRefusal(null);
  }
  if (connection === 'live' && sessionIsLost) setSessionIsLost(false);

  const shownTabs = useMemo(() => shownTabsOfBoard(board), [board]);
  const addressedRoute = route ?? BoardRouter.routeOf(null, boardStore.readChoice(TAB_CHOICE_NAME));
  const shownRoute = BoardRouter.shownRouteOf(addressedRoute, shownTabs);
  // Before the first board its tabs are not known, so a stored tab such as Pipeline would be overwritten by the default.
  const boardIsRead = board !== null;
  useEffect(() => {
    if (boardIsRead) boardStore.writeChoice(TAB_CHOICE_NAME, shownRoute.tab, DEFAULT_TAB);
  }, [boardIsRead, boardStore, shownRoute.tab]);

  const streamIsDown = connectionIsLost(connection);
  const installIsHeld = installRefusal !== null || boardIsHeld;
  const controlSurroundings = useMemo((): ControlSurroundings => ({
    availability:        ControlAvailabilityUtil.availabilityOf(streamIsDown || sessionIsLost, installIsHeld),
    commandClient:       services.commandClient,
    pictureUploadClient: services.pictureUploadClient,
    onInstallHeld:       setInstallRefusal,
    onSessionLost:       loseSession,
    onRefused:           countRefusal,
  }), [streamIsDown, sessionIsLost, installIsHeld, services, loseSession, countRefusal]);

  const boardClock = useMemo((): BoardClock => ({ ...BROWSER_BOARD_CLOCK, now: services.now }), [services]);
  const boardNow = useMemo(() => (board === null ? 0 : services.now().getTime()), [board, services]);
  const waitingOnUser = useMemo(() => (board === null ? null : WaitingOnUserModel.waitingOnUserOf(board)), [board]);
  const tabCounts = useMemo(() => (board === null || waitingOnUser === null ? {} : WaitingOnUserModel.tabCountsOf(board, waitingOnUser)), [board, waitingOnUser]);
  const [markedSeenIncidentIds, setMarkedSeenIncidentIds] = useState<readonly string[] | null>(null);
  const seenIncidentIds = useMemo(() => markedSeenIncidentIds ?? boardStore.readTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME), [markedSeenIncidentIds, boardStore]);
  const incidentNotice = useMemo(() => (board === null ? null : IncidentNoticeModelUtil.incidentNoticeModelOf(
    board,
    seenIncidentIds,
    { todayCalendarDate: TimeUtil.calendarDateOf(boardNow), slices: IncidentNoticeModelUtil.timestampSlicesOf(board) },
  )), [board, seenIncidentIds, boardNow]);
  const markIncidentDefaultsSeen = (): void => {
    if (board === null) return;
    const seenIds = IncidentNoticeModelUtil.seenIdsAfterMarking(board);
    boardStore.writeTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME, seenIds);
    setMarkedSeenIncidentIds(seenIds);
    // The line goes, and the focused button with it; the focus moves to the panel instead of falling to the body.
    mainPanelRef.current?.focus();
  };
  const flintBoardReading = useMemo((): BoardReading => ({ board, connection, refusedCommandCount }), [board, connection, refusedCommandCount]);
  const headerModel = headerModelOf(board, services.now(), connection);
  const TabView = tabViews[shownRoute.tab];

  const mainArea = (): ReactNode => {
    if (TabView === undefined) return unmovedTabArea(shownRoute);
    if (board === null) return <EmptyState text={WAITING_FOR_THE_FIRST_BOARD} />;
    return <TabView board={board} route={shownRoute} connection={connection} boardStore={boardStore} services={services} />;
  };

  return (
    <BoardTrackerContext value={services.trackerId}>
      <BoardGoToContext value={services.goTo}>
        <ControlSurroundingsContext value={controlSurroundings}>
          <BoardClockContext value={boardClock}>
            <BoardFlint
              boardStore={boardStore}
              boardReading={flintBoardReading}
              {...(services.flintFrameSource === undefined ? {} : { frameSource: services.flintFrameSource })}
              {...(services.onFlintHandle === undefined ? {} : { onHandle: services.onFlintHandle })}
            >
              <div className="board-shell">
                <ConnectionBanners
                  streamIsDown={streamIsDown}
                  boardShownAsOf={boardShownAsOf}
                  installHeldRefusal={installIsHeld ? installRefusal : undefined}
                  warnings={headerModel.warnings}
                  notices={headerModel.notices}
                />
                {incidentNotice === null ? null : <IncidentNotice model={incidentNotice} onMarkSeen={markIncidentDefaultsSeen} />}
                <Header
                  project={board?.project ?? project}
                  model={headerModel}
                  selectedTab={shownRoute.tab}
                  shownTabs={shownTabs}
                  activityIsLive={connection === 'live'}
                  sidePanelIsOpen={false}
                  clock={boardClock}
                  waitingOnUser={waitingOnUser}
                  tabCounts={tabCounts}
                  questionNotifier={services.questionNotifier}
                  timestampSlices={board === null ? null : IncidentNoticeModelUtil.timestampSlicesOf(board)}
                />
                <main
                  ref={mainPanelRef}
                  tabIndex={-1}
                  className="board-panel"
                  data-tab={shownRoute.tab}
                  data-unmoved={TabView === undefined ? '' : undefined}
                >
                  {mainArea()}
                </main>
              </div>
            </BoardFlint>
          </BoardClockContext>
        </ControlSurroundingsContext>
      </BoardGoToContext>
    </BoardTrackerContext>
  );
}
