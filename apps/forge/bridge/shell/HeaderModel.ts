/**
 * The header's model, pure: the status line (its label from the Overseer's state and the event stream, its mono details), which of
 * Pause, Resume and Restart the Overseer offers, the new-code notice, the header statistics, the activity strip's facts, the open notices
 * and the warnings, both worded by `NoticeWordingUtil` as the monitor snapshot words them. The incident defaults are the incident line's
 * (`IncidentNoticeModel.ts`), one line however many. While the board has no readable pipeline the header is in setup: its state pill
 * reads Setting up, and it holds the setup steps with the record's statuses, and no usage.
 */
import type { StepperStep } from 'design-system/Stepper';

import { TokenCountUtil }                                                from '../../src/lib/token-count/TokenCountUtil.ts';
import type { PipelineSetup }                                            from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { todayFiguresOf }                                                from '../../src/shared/monitor/TodayFigures.ts';
import { NoticeWordingUtil }                                             from '../../src/shared/monitor/utils/NoticeWordingUtil.ts';
import type { BoardStateDocument, OverseerFactsDocument, UsageDocument } from '../@types/BoardStateDocument.ts';
import type { ConnectionState }                                          from '../api/EventStreamClient.ts';
import { TimeUtil }                                                      from '../utils/TimeUtil.ts';
import { PIPELINE_SETUP_STEPS, PipelineViewModel, SETUP_STEP_LABELS }    from '../views/pipeline/PipelineViewModel.ts';
import { ActivityStripModel, NO_ACTIVITY, type ActivityStripFacts }      from './ActivityStripModel.ts';
import type { BridgeTab }                                                from './HashRouter.ts';

export type PauseControl = 'pause' | 'resume' | null;

/** The state pill's state: `live` only while serving, unpaused, with the event stream up; the pill is orange and its dot pulses only then. */
export type StatusToken = 'live' | 'paused' | 'connecting' | 'held' | 'passing-baton' | 'down';

/** The Kanban lanes a header figure points at. */
export type HeaderFigureLane = 'building' | 'done' | 'ready';

export interface HeaderStatistic {
  readonly figure:      string;
  readonly label:       string;
  /** The tab the figure opens, the Kanban for a lane's figure; `null` for a figure that opens nothing. */
  readonly opensTab:    BridgeTab | null;
  /** The Kanban lane the figure outlines once the tab shows, `null` for a figure that points at no lane. */
  readonly kanbanLane:  HeaderFigureLane | null;
  /** Set only on the paused figure, whose number takes the paused state's ink. */
  readonly state:       'paused' | null;
  /** What the figure counts, shown on hover; set only on the agents figure. */
  readonly explanation: string | null;
}

export interface HeaderModel {
  readonly statusToken:    StatusToken;
  /** The state pill's word: the status token's, or Setting up while the board is in setup. */
  readonly statusLabel:    string;
  /** The orange state pill with its dot: live and out of setup; every other state is the quiet pill. */
  readonly isRunning:      boolean;
  /** The quiet details after the state pill: each usage window the facts carry, then a usage limit hit; none in setup. */
  readonly statusDetails:  readonly string[];
  /** The setup steps with the record's statuses while the board has no readable pipeline; `null` once it has one, or says nothing of one. */
  readonly setupSteps:     readonly StepperStep[] | null;
  readonly pauseControl:   PauseControl;
  /** Only with new code on disk, and never during a Baton pass: Restart is the checked pass by hand, never automatic. */
  readonly restartOffered: boolean;
  readonly stopOffered:    boolean;
  readonly newCodeNotice:  string | null;
  readonly statistics:     readonly HeaderStatistic[];
  /** The strip's chips and counts. */
  readonly activity:       ActivityStripFacts;
  readonly notices:        readonly string[];
  readonly warnings:       readonly string[];
}

const STATUS_LABEL: Readonly<Record<StatusToken, string>> = {
  'live':          'Running',
  'paused':        'Paused',
  'connecting':    'Connecting',
  'held':          'Held',
  'passing-baton': 'Handing over',
  'down':          'Down',
};

const SETUP_STATUS_LABEL = 'Setting up';

const STATUS_TOKEN_OF_RUNTIME_STATE: Readonly<Record<Exclude<OverseerFactsDocument['state'], 'serving'>, StatusToken>> = {
  'held-by-install-change': 'held',
  'passing-baton':          'passing-baton',
  'down':                   'down',
};

const INCIDENT_DEFAULTED = 'incident-defaulted';

const NEW_CODE = 'new-code';

const PAUSED_DISPLAY_STATE = 'paused';

/** A window's word where it differs from the stored value. */
const USAGE_WINDOW_WORDS: Readonly<Record<string, string>> = { five_hour: '5-hour window', seven_day: 'week' };

function usageWindowWordOf(window: string): string {
  return Object.hasOwn(USAGE_WINDOW_WORDS, window) ? USAGE_WINDOW_WORDS[window] ?? window : window;
}

/**
 * Each usage window the facts carry, "5-hour window 14%" or "week 18%", then a limit hit with its reset on the viewer's clock (the stamp
 * is stored in UTC); a reset that does not parse is left out; nothing to say is no text.
 */
function usageTextsOf(usage: unknown): string[] {
  const facts = usage as Partial<UsageDocument> | null;
  const windowTexts = (facts?.windows ?? []).map((usageWindow) => `${usageWindowWordOf(usageWindow.window)} ${Math.round(usageWindow.utilization)}%`);
  if (typeof facts?.resetsAt !== 'string') return windowTexts;
  const window = typeof facts.window === 'string' ? `${usageWindowWordOf(facts.window)} ` : '';
  const resetsAtMilliseconds = Date.parse(facts.resetsAt);
  const resetText = Number.isNaN(resetsAtMilliseconds) ? '' : `, resets ${TimeUtil.clockOf(new Date(resetsAtMilliseconds))}`;
  return [...windowTexts, `${window}usage limit hit${resetText}`];
}

/** The record's current step is current; a done or recheck step links back to its route; with no record, Billing is current. */
function setupStepsOf(record: PipelineSetup | null): StepperStep[] {
  return PIPELINE_SETUP_STEPS.map((step) => {
    const status = PipelineViewModel.setupStepStatusOf(record, step);
    const reopens = status === 'done' || status === 'recheck';
    return {
      key: step, label: SETUP_STEP_LABELS[step], status, ...(reopens ? { href: PipelineViewModel.setupStepFragmentOf(step) } : {})
    };
  });
}

/** In setup while the board says its pipeline is anything but readable; an Overseer that serves no pipeline facts never is. */
function setupStepsOfBoard(state: BoardStateDocument | null): StepperStep[] | null {
  const pipeline = state?.pipeline;
  if (pipeline === undefined || pipeline.readingVerdict === 'readable') return null;
  return setupStepsOf(state?.pipelineSetup?.record ?? null);
}

interface BoardFigures {
  readonly workerCount:         number;
  readonly pausedCount:         number;
  readonly deliveredTodayCount: number;
  readonly tokensToday:         number;
  readonly waitingInQueueCount: number;
}

/** Today is the viewer's local date; the agents figure counts the strip's chips, so the figure and the strip agree. */
function boardFiguresOf(state: BoardStateDocument, activity: ActivityStripFacts, todayCalendarDate: string): BoardFigures {
  const tickets = state.page?.tickets ?? [];
  const today = todayFiguresOf(state, todayCalendarDate);
  return {
    workerCount:         activity.chips.length,
    pausedCount:         (state.page?.payload.boardFacts.tickets ?? []).filter((facts) => facts.displayState === PAUSED_DISPLAY_STATE).length,
    deliveredTodayCount: today.deliveredTickets,
    tokensToday:         today.tokens,
    waitingInQueueCount: tickets.filter((ticket) => ticket.status === 'pending').length,
  };
}

/**
 * The four board figures, agents against the limit, done today, tokens today and waiting in queue, with the paused figure after
 * the agents while any ticket is paused; then the Bridge's open incidents. The Waiting on User pill follows them and counts the open
 * questions.
 */
function statisticsOf(state: BoardStateDocument, figures: BoardFigures): HeaderStatistic[] {
  const { concurrency } = state;
  const agentsFigure = concurrency === undefined ? String(figures.workerCount) : `${concurrency.agentsInFlight} / ${concurrency.limit}`;
  const figure = (figureText: string, label: string, opensTab: BridgeTab | null, kanbanLane: HeaderFigureLane | null = null): HeaderStatistic => ({
    figure: figureText, label, opensTab, kanbanLane, state: null, explanation: null,
  });
  return [
    { ...figure(agentsFigure, 'agents working', 'kanban', 'building'), explanation: agentsExplanationOf(concurrency?.limit ?? null) },
    ...(figures.pausedCount === 0 ? [] : [{ ...figure(String(figures.pausedCount), 'paused', 'kanban', 'building'), state: PAUSED_DISPLAY_STATE } as const]),
    figure(String(figures.deliveredTodayCount), 'done today', 'kanban', 'done'),
    figure(TokenCountUtil.formatTokenCount(figures.tokensToday), 'tokens today', null),
    figure(String(figures.waitingInQueueCount), 'waiting in queue', 'kanban', 'ready'),
    figure(String(state.incidents.length), 'open incidents', 'assistant'),
  ];
}

function agentsExplanationOf(limit: number | null): string {
  const counted = limit === null ? 'Build and review jobs' : `Build and review jobs against the limit of ${limit}`;
  return `${counted}; the Assistant and product-owner jobs do not count`;
}

function statusTokenOf(overseer: OverseerFactsDocument | null, connection: ConnectionState): StatusToken {
  if (connection === 'down' || connection === 'no-session') return 'down';
  if (overseer === null || connection === 'connecting') return 'connecting';
  if (overseer.state !== 'serving') return STATUS_TOKEN_OF_RUNTIME_STATE[overseer.state];
  return overseer.paused ? 'paused' : 'live';
}

export function headerModelOf(state: BoardStateDocument | null, now: Date, connection: ConnectionState): HeaderModel {
  const overseer = state?.overseer ?? null;
  const notices = state?.notices ?? [];
  const handingOver = overseer?.state === 'passing-baton';
  const newCodeOnDisk = notices.some((notice) => notice.kind === NEW_CODE);
  const answers = overseer !== null && overseer.state !== 'down' && !handingOver;
  const statusToken = statusTokenOf(overseer, connection);
  const setupSteps = setupStepsOfBoard(state);
  const activity = state === null ? NO_ACTIVITY : ActivityStripModel.activityStripFactsOf(state.launchSlots, state.jobs, state.page?.tickets ?? []);
  const figures = state === null ? null : boardFiguresOf(state, activity, TimeUtil.calendarDateOf(now.getTime()));
  return {
    statusToken,
    statusLabel:    setupSteps === null ? STATUS_LABEL[statusToken] : SETUP_STATUS_LABEL,
    isRunning:      statusToken === 'live' && setupSteps === null,
    statusDetails:  state === null || setupSteps !== null ? [] : usageTextsOf(state.usage),
    setupSteps,
    pauseControl:   answers ? (overseer.paused ? 'resume' : 'pause') : null,
    restartOffered: answers && newCodeOnDisk,
    stopOffered:    answers,
    newCodeNotice:  newCodeOnDisk ? NoticeWordingUtil.noticeTextOf({ kind: NEW_CODE }) : null,
    statistics:     state === null || figures === null ? [] : statisticsOf(state, figures),
    activity,
    notices:        notices.filter((notice) => notice.kind !== INCIDENT_DEFAULTED && notice.kind !== NEW_CODE).map(NoticeWordingUtil.noticeTextOf),
    warnings:       NoticeWordingUtil.warningsOf(notices, overseer?.batonPassWarning ?? null).map((warning) => warning.text),
  };
}
