/**
 * The header's model, pure, in the forge's sentences and figures; the forge's controls are Gaia's forge bar's and the incident defaults the
 * incident line's. In setup it holds the steps for the page's own head, and its notices leave out a job not launched for want of an agent,
 * which the setup chooses, and list the new-code notice, which no status line shows then.
 */

import type { BoardDocument, BoardHephaestusDocument, BoardUsageDocument } from '../../@types/board/BoardDocument.ts';
import type { BoardNoticeDocument }                                        from '../../@types/board/BoardFactDocuments.ts';
import type { BoardSetupRecordDocument }                                   from '../../@types/board/BoardPipelineDocuments.ts';
import type { StepperStep }                                                from '../../lib/design-system/DesignSystemInterface.ts';
import type { SetupProgress }                                              from '../../shared/@types/SetupProgress.ts';
import type { BoardRoute, BoardTab }                                       from '../../shared/BoardRouter.ts';
import { CountTextUtil }                                                   from '../../shared/utils/CountTextUtil.ts';
import type { ConnectionState }                                            from '../api/BoardEventStreamClient.ts';
import { TimeUtil }                                                        from '../utils/TimeUtil.ts';
import { PipelineViewModel, SETUP_STEP_LABELS }                            from '../views/pipeline/PipelineViewModel.ts';
import { ActivityStripModel, NO_ACTIVITY, type ActivityStripFacts }        from './ActivityStripModel.ts';

/** The state pill's state: `live` only while serving, unpaused, with the event stream up; the pill is orange and its dot pulses only then. */
export type StatusToken = 'live' | 'paused' | 'connecting' | 'held' | 'restarting' | 'down';

/** The Kanban lanes a header figure points at. */
export type HeaderFigureLane = 'building' | 'done' | 'ready';

export interface HeaderStatistic {
  readonly figure:      string;
  readonly label:       string;
  /** The tab the figure opens, the Kanban for a lane's figure; `null` for a figure that opens nothing. */
  readonly opensTab:    BoardTab | null;
  /** The Kanban lane the figure outlines once the tab shows, `null` for a figure that points at no lane. */
  readonly kanbanLane:  HeaderFigureLane | null;
  /** Set only on the paused figure, whose number takes the paused state's ink. */
  readonly state:       'paused' | null;
  /** What the figure counts, shown on hover; set only on the agents figure. */
  readonly explanation: string | null;
}

/** A setup step as the stepper shows it, with the route a done or recheck step reopens; the header turns the route into its link. */
export type SetupStepView = Omit<StepperStep, 'href'> & { readonly reopensAt: BoardRoute | null };

export interface HeaderModel {
  readonly statusToken:   StatusToken;
  /** The state pill's word. */
  readonly statusLabel:   string;
  /** The orange state pill with its dot: live; every other state is the quiet pill. */
  readonly isRunning:     boolean;
  /** The quiet details after the state pill: each usage window the facts carry, then a usage limit hit. */
  readonly statusDetails: readonly string[];
  /**
   * The setup steps with the record's statuses while the board has no readable pipeline, when the board draws no header; `null` once it has
   * one, and before the first board.
   */
  readonly setupSteps:    readonly SetupStepView[] | null;
  /** Where the setup stands while the board is in setup; `null` out of it. */
  readonly setupProgress: SetupProgress | null;
  /** The forge's sentence while new code is on disk. */
  readonly newCodeNotice: string | null;
  readonly statistics:    readonly HeaderStatistic[];
  /** The strip's chips and counts. */
  readonly activity:      ActivityStripFacts;
  readonly notices:       readonly string[];
  readonly warnings:      readonly string[];
}

const STATUS_LABEL: Readonly<Record<StatusToken, string>> = {
  'live':       'Running',
  'paused':     'Paused',
  'connecting': 'Connecting',
  'held':       'Held',
  'restarting': 'Restarting',
  'down':       'Down',
};

const STATUS_TOKEN_OF_RUNTIME_STATE: Readonly<Record<Exclude<BoardHephaestusDocument['state'], 'serving'>, StatusToken>> = {
  'held-by-install-change': 'held',
  'restarting':             'restarting',
  'down':                   'down',
};

const INCIDENT_DEFAULTED = 'incident-defaulted';

const NEW_CODE = 'new-code';

const AGENT_PROGRAM_REFUSED = 'agent-program-refused';

const PAUSED_DISPLAY_STATE = 'paused';

const HOURS_IN_A_WEEK = 168;

/** "5-hour window", "week" for a week, and the window's stored name when its length is unknown. */
function usageWindowWordOf(window: string, lengthHours: number | null): string {
  if (lengthHours === null) return window;
  return lengthHours === HOURS_IN_A_WEEK ? 'week' : `${lengthHours}-hour window`;
}

/**
 * Each usage window the facts carry, "5-hour window 14%" or "week 18%", then a limit hit with its reset on the viewer's clock (the stamp
 * is stored in UTC); a reset that does not parse is left out; nothing to say is no text.
 */
function usageTextsOf(usage: BoardUsageDocument): string[] {
  const { windows } = usage;
  const windowTexts = windows.map((usageWindow) => `${usageWindowWordOf(usageWindow.window, usageWindow.lengthHours)} ${Math.round(usageWindow.utilization)}%`);
  if (usage.resetsAt === null) return windowTexts;
  const limitWindow = usage.window;
  const limitWindowLength = windows.find((usageWindow) => usageWindow.window === limitWindow)?.lengthHours ?? null;
  const window = limitWindow === null ? '' : `${usageWindowWordOf(limitWindow, limitWindowLength)} `;
  const resetsAtMilliseconds = Date.parse(usage.resetsAt);
  const resetText = Number.isNaN(resetsAtMilliseconds) ? '' : `, resets ${TimeUtil.clockOf(new Date(resetsAtMilliseconds))}`;
  return [...windowTexts, `${window}usage limit hit${resetText}`];
}

/** The record's current step is current; a done or recheck step reopens at its route; with no record, Agent is current. */
function setupStepsOf(record: BoardSetupRecordDocument | null): SetupStepView[] {
  return PipelineViewModel.setupStepsOf(record).map((step) => {
    const status = PipelineViewModel.setupStepStatusOf(record, step);
    const reopens = status === 'done' || status === 'recheck';
    return {
      key: step, label: SETUP_STEP_LABELS[step], status, reopensAt: reopens ? PipelineViewModel.setupStepRouteOf(step) : null,
    };
  });
}

/** In setup while the board says its pipeline is anything but readable; before the first board it is not. */
function setupStepsOfBoard(board: BoardDocument | null): SetupStepView[] | null {
  if (board === null || !PipelineViewModel.isInSetup(board)) return null;
  return setupStepsOf(board.pipeline.setup?.record ?? null);
}

/** The setup stands at the stepper's current step; with none current it has not started. */
function progressAtCurrentStepOf(setupSteps: readonly SetupStepView[]): SetupProgress {
  const currentIndex = setupSteps.findIndex((step) => step.status === 'current');
  return currentIndex < 0 ? { stage: 'not-started' } : { stage: 'setting-up', stepNumber: currentIndex + 1, stepCount: setupSteps.length };
}

/** A setup record in setup mode stands at its current step; before one opens the setup has not started. */
function setupProgressOf(board: BoardDocument, setupSteps: readonly SetupStepView[]): SetupProgress {
  return board.pipeline.setup?.record.mode === 'setup' ? progressAtCurrentStepOf(setupSteps) : { stage: 'not-started' };
}

/** On the agent step that starts a setup, before a record opens, the setup stands at that first step, which its stepper marks current. */
export function setupProgressOnStartingStepOf(setupSteps: readonly SetupStepView[]): SetupProgress {
  return progressAtCurrentStepOf(setupSteps);
}

/** A job not launched because the board has no agent yet says only what the setup is there to choose. */
function waitsOnlyForAnAgent(notice: BoardNoticeDocument): boolean {
  return notice.kind === AGENT_PROGRAM_REFUSED && PipelineViewModel.isNotLaunchedForWantOfAnAgent(notice.facts['cause']);
}

/** Out of setup the new-code notice is the status line's; in setup no status line shows, so it is listed, and an agent's absence is not. */
function noticesShownOf(notices: readonly BoardNoticeDocument[], isInSetup: boolean): string[] {
  return notices
    .filter((notice) => notice.kind !== INCIDENT_DEFAULTED && (isInSetup ? !waitsOnlyForAnAgent(notice) : notice.kind !== NEW_CODE))
    .map((notice) => notice.text);
}

interface BoardFigures {
  readonly workerCount:         number;
  readonly pausedCount:         number;
  readonly deliveredTodayCount: number;
  readonly tokensToday:         number;
  readonly waitingInQueueCount: number;
}

/**
 * Today's figures as the forge serves them, shown only on the date it counted them, which is the viewer's local date; on another date they
 * read zero until the forge counts again. The agents figure counts the strip's chips, so the figure and the strip agree.
 */
function boardFiguresOf(board: BoardDocument, activity: ActivityStripFacts, todayCalendarDate: string): BoardFigures {
  const { today } = board;
  const countedToday = today.calendarDate === todayCalendarDate;
  return {
    workerCount:         activity.chips.length,
    pausedCount:         board.page.facts.tickets.filter((facts) => facts.displayState === PAUSED_DISPLAY_STATE).length,
    deliveredTodayCount: countedToday ? today.deliveredTickets : 0,
    tokensToday:         countedToday ? today.tokens : 0,
    waitingInQueueCount: board.page.tickets.filter((ticket) => ticket.status === 'committed').length,
  };
}

function agentsExplanationOf(limit: number): string {
  return `Build and review jobs against the limit of ${limit}; the Assistant and product-owner jobs do not count`;
}

/**
 * The four board figures, agents against the limit, done today, tokens today and waiting in queue, with the paused figure after
 * the agents while any ticket is paused; then the board's open incidents. The Waiting on User pill follows them and counts the open
 * questions.
 */
function statisticsOf(board: BoardDocument, figures: BoardFigures): HeaderStatistic[] {
  const { concurrency } = board;
  const figure = (figureText: string, label: string, opensTab: BoardTab | null, kanbanLane: HeaderFigureLane | null = null): HeaderStatistic => ({
    figure: figureText, label, opensTab, kanbanLane, state: null, explanation: null,
  });
  return [
    { ...figure(`${concurrency.agentsInFlight} / ${concurrency.limit}`, 'agents working', 'kanban', 'building'), explanation: agentsExplanationOf(concurrency.limit) },
    ...(figures.pausedCount === 0 ? [] : [{ ...figure(String(figures.pausedCount), 'paused', 'kanban', 'building'), state: PAUSED_DISPLAY_STATE } as const]),
    figure(String(figures.deliveredTodayCount), 'done today', 'kanban', 'done'),
    figure(CountTextUtil.shortCountTextOf(figures.tokensToday), 'tokens today', null),
    figure(String(figures.waitingInQueueCount), 'waiting in queue', 'kanban', 'ready'),
    figure(String(board.incidents.length), 'open incidents', 'assistant'),
  ];
}

function statusTokenOf(hephaestus: BoardHephaestusDocument | null, connection: ConnectionState): StatusToken {
  if (connection === 'down' || connection === 'no-session') return 'down';
  if (hephaestus === null || connection === 'connecting') return 'connecting';
  if (hephaestus.state !== 'serving') return STATUS_TOKEN_OF_RUNTIME_STATE[hephaestus.state];
  return hephaestus.paused ? 'paused' : 'live';
}

export function headerModelOf(board: BoardDocument | null, now: Date, connection: ConnectionState): HeaderModel {
  const statusToken = statusTokenOf(board?.hephaestus ?? null, connection);
  const setupSteps = setupStepsOfBoard(board);
  const activity = board === null ? NO_ACTIVITY : ActivityStripModel.activityStripFactsOf(board.launchSlots, board.jobs, board.page.tickets);
  const notices = board?.notices ?? [];
  return {
    statusToken,
    statusLabel:   STATUS_LABEL[statusToken],
    isRunning:     statusToken === 'live',
    statusDetails: board === null ? [] : usageTextsOf(board.usage),
    setupSteps,
    setupProgress: board === null || setupSteps === null ? null : setupProgressOf(board, setupSteps),
    newCodeNotice: notices.find((notice) => notice.kind === NEW_CODE)?.text ?? null,
    statistics:    board === null ? [] : statisticsOf(board, boardFiguresOf(board, activity, TimeUtil.calendarDateOf(now.getTime()))),
    activity,
    notices:       noticesShownOf(notices, setupSteps !== null),
    warnings:      (board?.warnings ?? []).map((warning) => warning.text),
  };
}
