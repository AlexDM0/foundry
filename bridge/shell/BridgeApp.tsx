/**
 * The Bridge's shell: it follows the Overseer's event stream into one state, routes the hash to a tab, wires the embedded channel, and says
 * whether controls may act. After the stream comes back it asks `/api/identity` again and reloads when the Overseer runs new code, since
 * the bundle it holds may no longer match the API. A refused session code, or a session the Overseer no longer knows, raises the session
 * banner in place of the wait for a board. Everything it reaches outside the page arrives in `services`, so a DOM spec fakes it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { BoardStateDocument, OverseerIdentity }                                     from '../@types/BoardStateDocument.ts';
import type { ConversationBoardDocument }                                                from '../@types/ConversationDocuments.ts';
import type { PreferenceStorage }                                                        from '../@types/PreferenceStorage.ts';
import type { CommandClient }                                                            from '../api/CommandClient.ts';
import type { ConnectionState, EventStreamHandlers }                                     from '../api/EventStreamClient.ts';
import type { SessionExchangeOutcome }                                                   from '../api/SessionCodeExchange.ts';
import type { TranscriptFollower }                                                       from '../conversation/TranscriptLog.tsx';
import { boardPreferenceStoreOf, sharedPreferenceStoreOf }                               from '../preferences/PreferenceStore.ts';
import { FinishedWorkUtil }                                                              from '../utils/FinishedWorkUtil.ts';
import type { SessionLoss }                                                              from '../utils/SessionWordingUtil.ts';
import { TimeUtil }                                                                      from '../utils/TimeUtil.ts';
import { AgentsView }                                                                    from '../views/agents/AgentsView.tsx';
import { AssistantView }                                                                 from '../views/assistant/AssistantView.tsx';
import { EpicsModel }                                                                    from '../views/epics/EpicsModel.ts';
import { EpicsView }                                                                     from '../views/epics/EpicsView.tsx';
import { FinishedWorkView }                                                              from '../views/finished-work/FinishedWorkView.tsx';
import { IntakeView }                                                                    from '../views/intake/IntakeView.tsx';
import { KanbanModel }                                                                   from '../views/kanban/KanbanModel.ts';
import { KanbanView }                                                                    from '../views/kanban/KanbanView.tsx';
import { MergeQueueModel }                                                               from '../views/merge-queue/MergeQueueModel.ts';
import { MergeQueueView }                                                                from '../views/merge-queue/MergeQueueView.tsx';
import { ProgressModel }                                                                 from '../views/progress/ProgressModel.ts';
import { ProgressView }                                                                  from '../views/progress/ProgressView.tsx';
import { QuestionAlerts, type QuestionNotifier }                                         from '../views/questions/QuestionAlerts.ts';
import { QuestionsView }                                                                 from '../views/questions/QuestionsView.tsx';
import { TicketsModel }                                                                  from '../views/tickets/TicketsModel.ts';
import { TicketsView }                                                                   from '../views/tickets/TicketsView.tsx';
import { WavesModel }                                                                    from '../views/waves/WavesModel.ts';
import { WavesView }                                                                     from '../views/waves/WavesView.tsx';
import { ActivityStripModel }                                                            from './ActivityStripModel.ts';
import { BoardStateUpdate }                                                              from './BoardStateUpdate.ts';
import { BROWSER_BRIDGE_CLOCK, BridgeClockContext, type BridgeClock }                    from './BridgeClock.ts';
import { ConnectionBanners }                                                             from './ConnectionBanners.tsx';
import { ControlAvailabilityUtil, ControlSurroundingsContext, type ControlSurroundings } from './ControlAvailability.ts';
import { DetailPanelHost }                                                               from './DetailPanelHost.tsx';
import { DetailRoute }                                                                   from './DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf }                                         from './DetailRouting.ts';
import { EmbeddedChannel, type EmbeddedSurroundings }                                    from './EmbeddedChannel.ts';
import { FinishedWorkFilter, useFinishedWorkChoice }                                     from './FinishedWorkFilter.tsx';
import { FinishedWorkWindowContext, type FinishedWorkWindow }                            from './FinishedWorkWindow.ts';
import { DEFAULT_TAB, HashRouter, TAB_CHOICE_NAME }                                      from './HashRouter.ts';
import { Header }                                                                        from './Header.tsx';
import { HeaderModelUtil }                                                               from './HeaderModel.ts';
import { ThemeBootstrap, type ThemeChoice }                                              from './ThemeBootstrap.ts';

export interface BridgeServices {
  readonly commandClient:        CommandClient;
  readonly openEventStream:      (handlers: EventStreamHandlers) => { close: () => void };
  readonly fetchIdentity:        () => Promise<OverseerIdentity | null>;
  readonly reload:               () => void;
  readonly storage:              () => PreferenceStorage;
  readonly embedded:             boolean;
  readonly embeddedSurroundings: () => EmbeddedSurroundings;
  readonly now:                  () => Date;
  readonly followTranscript:     TranscriptFollower;
  readonly questionNotifier:     QuestionNotifier;
}

export interface BridgeAppProps {
  readonly services:                BridgeServices;
  /** How the code in the fragment fared before the shell mounted; `no-code` when absent. */
  readonly sessionExchangeOutcome?: SessionExchangeOutcome;
}

const HELD_BY_INSTALL_CHANGE = 'held-by-install-change';

/** The Kanban's Merge queue lane opens its detail at `#kanban/merge-queue`. */
export const MERGE_QUEUE_ITEM = 'merge-queue';

export function BridgeApp({ services, sessionExchangeOutcome = 'no-code' }: BridgeAppProps) {
  const sharedStore = useMemo(() => sharedPreferenceStoreOf(services.storage), [services]);
  const [identity, setIdentity] = useState<OverseerIdentity | null>(null);
  const [boardState, setBoardState] = useState<BoardStateDocument | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [boardShownAsOf, setBoardShownAsOf] = useState<string | null>(null);
  const [installRefusal, setInstallRefusal] = useState<string | null>(null);
  const [sessionIsLost, setSessionIsLost] = useState(false);
  // A refused code stays shown even when an older cookie still opens the stream: another process may hold a session from it.
  const sessionLoss: SessionLoss | null = sessionExchangeOutcome === 'refused' ? 'code-refused' : (sessionIsLost ? 'no-session' : null);
  const loseSession = useCallback(() => setSessionIsLost(true), []);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => ThemeBootstrap.themeChoiceOf(sharedStore.readChoice('theme')));
  const knownCodeVersion = useRef<string | null>(null);
  const streamWasDown = useRef(false);

  const boardStore = useMemo(() => (identity === null ? null : boardPreferenceStoreOf(identity.trackerId, services.storage)), [identity, services]);
  const storedTab = useCallback(() => boardStore?.readChoice(TAB_CHOICE_NAME) ?? null, [boardStore]);
  const addressedRoute = HashRouter.useHashRoute(storedTab);
  const [finishedWorkChoice, chooseFinishedWork] = useFinishedWorkChoice(boardStore);
  const conversationBoard = boardState as ConversationBoardDocument | null;
  QuestionAlerts.useOpenQuestionAlerts(conversationBoard?.decisions ?? null, services.questionNotifier);

  useEffect(() => {
    let current = true;
    void services.fetchIdentity().then((fetched) => {
      if (!current || fetched === null) return;
      knownCodeVersion.current = fetched.codeVersion;
      setIdentity(fetched);
    });
    return () => {
      current = false;
    };
  }, [services]);

  useEffect(() => {
    const stream = services.openEventStream({
      onEvent: (kind, data) => {
        setBoardState((previous) => BoardStateUpdate.boardStateAfter(previous, kind, data));
        if (kind !== 'board') return;
        setBoardShownAsOf(services.now().toLocaleString());
        if ((data as Partial<BoardStateDocument>).overseer?.state !== HELD_BY_INSTALL_CHANGE) setInstallRefusal(null);
      },
      onConnection: (state) => {
        setConnection(state);
        if (state === 'no-session') loseSession();
        if (state === 'live') setSessionIsLost(false);
        if (state === 'down') streamWasDown.current = true;
        if (state !== 'live' || !streamWasDown.current) return;
        streamWasDown.current = false;
        void services.fetchIdentity().then((fetched) => {
          if (fetched !== null && knownCodeVersion.current !== null && fetched.codeVersion !== knownCodeVersion.current) services.reload();
        });
      },
    });
    return () => stream.close();
  }, [services, loseSession]);

  const progressBoardState = useMemo(() => ProgressModel.progressBoardStateOf(boardState), [boardState]);
  // The chart and the waves read the clock once per board: what moves with it is only shown, and moves on with the next board.
  const boardNow = useMemo(() => (boardState === null ? 0 : services.now().getTime()), [boardState, services]);
  const wavesCanvas = useMemo(() => (progressBoardState === null ? null : WavesModel.wavesModelOf(progressBoardState, boardNow)), [progressBoardState, boardNow]);
  const shownTabs = useMemo(() => HashRouter.shownTabsOf(
    boardState === null ? null : wavesCanvas !== null,
    boardState?.page === undefined ? null : boardState.page.payload.boardFacts.epics.length > 0,
  ), [boardState, wavesCanvas]);
  const route = HashRouter.shownRouteOf(addressedRoute, shownTabs);
  const { tab: routeTab, item: routeItem } = route;
  const detailRouting = useMemo(
    () => (DetailRoute.isDetailTab(routeTab)
      ? detailRoutingOf(routeTab, DetailRoute.openDetailOf({ tab: routeTab, item: routeItem }), HashRouter.navigateTo)
      : null),
    [routeTab, routeItem],
  );
  const openDetail = detailRouting?.openItem ?? null;

  const panelIsOpen = route.item !== null;
  const panelIsOpenNow = useRef(panelIsOpen);
  useEffect(() => {
    panelIsOpenNow.current = panelIsOpen;
  }, [panelIsOpen]);

  useEffect(() => {
    if (!services.embedded) return undefined;
    const channel = EmbeddedChannel.open(services.embeddedSurroundings(), {
      onTheme:     (theme) => ThemeBootstrap.applyParentTheme(theme),
      panelIsOpen: () => panelIsOpenNow.current,
    });
    return () => channel.close();
  }, [services]);

  useEffect(() => {
    boardStore?.writeChoice(TAB_CHOICE_NAME, route.tab, DEFAULT_TAB);
  }, [boardStore, route.tab]);

  const streamIsDown = connection === 'down';
  const installIsHeld = installRefusal !== null || boardState?.overseer.state === HELD_BY_INSTALL_CHANGE;
  const controlSurroundings = useMemo((): ControlSurroundings => ({
    availability:  ControlAvailabilityUtil.availabilityOf(streamIsDown || sessionIsLost, installIsHeld),
    commandClient: services.commandClient,
    onInstallHeld: setInstallRefusal,
    onSessionLost: loseSession,
  }), [streamIsDown, sessionIsLost, installIsHeld, services, loseSession]);

  const bridgeClock = useMemo((): BridgeClock => ({ now: services.now, everySecond: BROWSER_BRIDGE_CLOCK.everySecond }), [services]);
  const kanbanBoardState = useMemo(() => KanbanModel.kanbanBoardStateOf(boardState), [boardState]);
  const ticketsBoardState = useMemo(() => TicketsModel.ticketsBoardStateOf(boardState), [boardState]);
  const epicsBoardState = useMemo(() => EpicsModel.epicsBoardStateOf(boardState), [boardState]);
  const headerModel = HeaderModelUtil.headerModelOf(boardState, services.now(), connection);
  const activity = useMemo(
    () => (boardState?.page === undefined ? [] : ActivityStripModel.activityEntriesOf(boardState.page.payload.progress.tasks, boardState.page.tickets)),
    [boardState],
  );
  const mergeQueueIsOpen = route.tab === 'kanban' && route.item === MERGE_QUEUE_ITEM;
  const boardViewIsShown = route.tab === 'agents' || route.tab === 'questions' || route.tab === 'assistant' || route.tab === 'intake' || mergeQueueIsOpen
    || (route.tab === 'kanban' && kanbanBoardState !== null)
    || (route.tab === 'tickets' && ticketsBoardState !== null)
    || (route.tab === 'waves' && wavesCanvas !== null)
    || ((route.tab === 'progress' || route.tab === 'epics') && (progressBoardState !== null || boardState?.page !== undefined));

  const chooseTheme = (choice: ThemeChoice): void => {
    ThemeBootstrap.chooseTheme(sharedStore, choice);
    setThemeChoice(choice);
  };

  const finishedWorkWindow: FinishedWorkWindow = {
    choice:                  finishedWorkChoice,
    cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(finishedWorkChoice, boardNow),
    nowEpochMilliseconds:    boardNow,
  };
  const page = boardState?.page;
  const filter = page === undefined || !DetailRoute.isDetailTab(route.tab) ? null : (
    <FinishedWorkFilter
      choice={finishedWorkChoice}
      onChoice={chooseFinishedWork}
      tickets={page.tickets}
      epics={page.payload.boardFacts.epics}
      nowEpochMilliseconds={boardNow}
    />
  );

  const boardViews = (
    <>
      {boardState !== null && mergeQueueIsOpen
        ? <MergeQueueView targets={MergeQueueModel.mergeQueueModelOf(boardState.mergeQueue, boardState.notices ?? [])} />
        : null}
      {kanbanBoardState !== null && route.tab === 'kanban' && !mergeQueueIsOpen
        ? (
          <>
            <p><a href={HashRouter.fragmentOf({ tab: 'kanban', item: MERGE_QUEUE_ITEM })}>Merge queue</a></p>
            <KanbanView boardState={kanbanBoardState} boardStore={boardStore} />
          </>
        )
        : null}
      {wavesCanvas !== null && route.tab === 'waves' ? <WavesView canvas={wavesCanvas} /> : null}
      {progressBoardState !== null && route.tab === 'progress'
        ? <ProgressView boardState={progressBoardState} boardStore={boardStore} nowEpochMilliseconds={boardNow} todayCalendarDate={TimeUtil.calendarDateOf(boardNow)} />
        : null}
      {page !== undefined && route.tab === 'progress'
        ? <FinishedWorkView tickets={page.tickets} choice={finishedWorkChoice} nowEpochMilliseconds={boardNow} />
        : null}
      {epicsBoardState !== null && route.tab === 'epics'
        ? <EpicsView boardState={epicsBoardState} pointedEpicKey={DetailRoute.pointedEpicKeyOf(route)} />
        : null}
      {ticketsBoardState !== null && route.tab === 'tickets'
        ? <TicketsView boardState={ticketsBoardState} boardStore={boardStore} />
        : null}
      {boardState !== null && openDetail !== null
        ? <DetailPanelHost boardState={boardState} item={openDetail} todayCalendarDate={TimeUtil.calendarDateOf(services.now().getTime())} />
        : null}
    </>
  );

  return (
    <ControlSurroundingsContext.Provider value={controlSurroundings}>
      <div className="bridge-shell">
        <ConnectionBanners
          streamIsDown={streamIsDown}
          boardShownAsOf={boardShownAsOf}
          installHeldRefusal={installIsHeld ? installRefusal : undefined}
          sessionLoss={sessionLoss}
          warnings={headerModel.warnings}
          notices={headerModel.notices}
        />
        <Header
          project={boardState?.project ?? identity?.project ?? ''}
          model={headerModel}
          selectedTab={route.tab}
          shownTabs={shownTabs}
          themeChoice={themeChoice}
          onThemeChoice={chooseTheme}
          activity={activity}
          activityIsLive={connection === 'live'}
          clock={bridgeClock}
          tabBarEnd={filter}
        />
        <main className="bridge-panel" data-tab={route.tab}>
          {boardState === null && sessionLoss === null
            ? <p className="bridge-empty">Waiting for the Overseer&apos;s first board.</p>
            : null}
          {boardState !== null && route.tab === 'agents'
            ? <AgentsView jobs={boardState.jobs} decisions={boardState.decisions} selectedJobId={route.item} clock={bridgeClock} />
            : null}
          {conversationBoard !== null && route.tab === 'questions'
            ? <QuestionsView board={conversationBoard} notifier={services.questionNotifier} />
            : null}
          {conversationBoard !== null && route.tab === 'assistant'
            ? <AssistantView board={conversationBoard} followTranscript={services.followTranscript} />
            : null}
          {conversationBoard !== null && route.tab === 'intake'
            ? <IntakeView board={conversationBoard} followTranscript={services.followTranscript} />
            : null}
          <BridgeClockContext.Provider value={bridgeClock}>
            <FinishedWorkWindowContext.Provider value={finishedWorkWindow}>
              {detailRouting === null ? boardViews : <DetailRoutingContext.Provider value={detailRouting}>{boardViews}</DetailRoutingContext.Provider>}
            </FinishedWorkWindowContext.Provider>
          </BridgeClockContext.Provider>
          {boardState !== null && !boardViewIsShown
            ? <BoardCounts boardState={boardState} tab={route.tab} />
            : null}
        </main>
      </div>
    </ControlSurroundingsContext.Provider>
  );
}

function BoardCounts({ boardState, tab }: { readonly boardState: BoardStateDocument; readonly tab: string }) {
  return (
    <p className="bridge-empty">
      {`${boardState.jobs.length} jobs, ${boardState.decisions.length} decisions, ${boardState.incidents.length} incidents. `}
      {tab === 'kanban' ? <a href={HashRouter.fragmentOf({ tab: 'kanban', item: MERGE_QUEUE_ITEM })}>Merge queue</a> : null}
    </p>
  );
}
