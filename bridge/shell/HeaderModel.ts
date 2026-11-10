/**
 * The header's model, pure: the status line (its label from the Overseer's state and the event stream, its mono details), which of
 * Pause, Resume and Restart the Overseer offers, the new-code notice, the header statistics, the activity strip's facts, the open notices
 * and the warnings (owner answer Q34): every incident default, a failed Baton pass with its step and error, and an Assistant that cannot
 * come up. Warnings are derived from the notices and the Overseer's facts, never stored.
 */
import { TokenCountUtil } from '../../src/lib/token-count/TokenCountUtil.ts';
import { PRODUCT_NAMES }  from '../../src/shared/constants/ProductNames.ts';
import type {
  BoardStateDocument,
  NoticeDocument,
  OverseerFactsDocument,
  UsageDocument
} from '../@types/BoardStateDocument.ts';
import type { ConnectionState }                                     from '../api/EventStreamClient.ts';
import { IncidentTrailUtil }                                        from '../utils/IncidentTrailUtil.ts';
import { TimeUtil }                                                 from '../utils/TimeUtil.ts';
import { ActivityStripModel, NO_ACTIVITY, type ActivityStripFacts } from './ActivityStripModel.ts';
import type { BridgeTab }                                           from './HashRouter.ts';

export type PauseControl = 'pause' | 'resume' | null;

/** The status line's state: `live` only while serving, unpaused, with the event stream up; the dot pulses only then. */
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

/** One figure of the embedded summary line, after a dot of its state's colour unless `state` is `null`. */
export interface SummaryLineFigure {
  readonly figure: string;
  readonly label:  string;
  readonly state:  'in-progress' | 'reviewing' | 'pending' | 'paused' | 'delivered' | null;
}

/** The embedded page's one line of board figures: the states, then today's figures at its far end. */
export interface SummaryLine {
  readonly states: readonly SummaryLineFigure[];
  readonly today:  readonly SummaryLineFigure[];
}

export interface HeaderModel {
  readonly statusToken:    StatusToken;
  readonly statusLabel:    string;
  /** The status line's mono details after the label: usage, then the board's confinement word. */
  readonly statusDetails:  readonly string[];
  readonly pauseControl:   PauseControl;
  /** Only with new code on disk, and never during a Baton pass: Restart is the checked pass by hand, never automatic. */
  readonly restartOffered: boolean;
  readonly stopOffered:    boolean;
  readonly newCodeNotice:  string | null;
  readonly statistics:     readonly HeaderStatistic[];
  /** The strip's chips and counts, the same facts the summary line's building and reviewing figures read. */
  readonly activity:       ActivityStripFacts;
  /** `null` before the first board. */
  readonly summaryLine:    SummaryLine | null;
  readonly notices:        readonly string[];
  readonly warnings:       readonly string[];
}

const STATUS_LABEL: Readonly<Record<StatusToken, string>> = {
  'live':          'Live',
  'paused':        'Paused',
  'connecting':    'Connecting',
  'held':          'Held',
  'passing-baton': 'Handing over',
  'down':          'Down',
};

const STATUS_TOKEN_OF_RUNTIME_STATE: Readonly<Record<Exclude<OverseerFactsDocument['state'], 'serving'>, StatusToken>> = {
  'held-by-install-change': 'held',
  'passing-baton':          'passing-baton',
  'down':                   'down',
};

const NO_ASSISTANT_CAUSE = 'no-assistant';

const INCIDENT_DEFAULTED = 'incident-defaulted';

const NEW_CODE = 'new-code';

const CALENDAR_DATE_LENGTH_CHARACTERS = 10;

const CLOCK_SLICE = { start: 11, end: 16 } as const;

const PAUSED_DISPLAY_STATE = 'paused';

function factOf(notice: NoticeDocument, fact: string): string {
  const value = notice[fact];
  if (Array.isArray(value)) return value.map(String).join(', ');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function noticeTextOf(notice: NoticeDocument): string {
  switch (notice.kind) {
    case 'install-version-changed':
      return `the install version changed, so launches are held: run \`${PRODUCT_NAMES.PROGRAM} update\``;
    case 'claude-md-block-committed':
      return `launches onto ${factOf(notice, 'target')} wait: commit the CLAUDE.md change \`update\` made`;
    case 'attribution-found':
      return `ticket #${factOf(notice, 'ticketId')} carries an AI attribution`;
    case 'rounds-not-converging':
      return `ticket #${factOf(notice, 'ticketId')}'s review rounds are not converging`;
    case 'dirty-main-checkout':
      return factOf(notice, 'blockingFiles') === ''
        ? `landings on ${factOf(notice, 'target')} wait: the main checkout is not on ${factOf(notice, 'target')}`
        : `landings on ${factOf(notice, 'target')} wait: the main checkout's changes to ${factOf(notice, 'blockingFiles')} block the fast-forward`;
    case 'target-file-held':
      return `landings on ${factOf(notice, 'target')} wait: another process holds ${factOf(notice, 'heldFiles')} open, so git cannot replace what is held`;
    case 'cleanup-declined':
      return `git declined the ${factOf(notice, 'cleanup')} cleanup of ${factOf(notice, 'groupBranch')}: ${factOf(notice, 'reason')}`;
    case 'agent-program-refused':
      return `job ${factOf(notice, 'jobId')} is not launched: ${factOf(notice, 'reason')}`;
    case 'watcher-endpoint-does-not-fit':
      return `job ${factOf(notice, 'jobId')} is not launched: this platform cannot bind the Watcher endpoint ${factOf(notice, 'endpoint')}`;
    default:
      return notice.kind;
  }
}

function incidentDefaultTextOf(notice: NoticeDocument): string {
  const cause = factOf(notice, 'cause');
  return `incident ${factOf(notice, 'incidentId')} took its default, ${factOf(notice, 'move')}: ${IncidentTrailUtil.defaultCauseTextOf(cause)}`;
}

/** Any open notice as one sentence: an incident default as its warning words it, every other kind as the notice line does. */
function noticeSentenceOf(notice: NoticeDocument): string {
  return notice.kind === INCIDENT_DEFAULTED ? incidentDefaultTextOf(notice) : noticeTextOf(notice);
}

function warningsOf(notices: readonly NoticeDocument[], overseer: OverseerFactsDocument | null): string[] {
  const defaulted = notices.filter((notice) => notice.kind === INCIDENT_DEFAULTED);
  const batonPass = overseer?.batonPassWarning ?? null;
  return [
    ...defaulted.map(incidentDefaultTextOf),
    ...(batonPass === null ? [] : [`the Baton pass to code ${batonPass.successorCodeVersion} failed at ${batonPass.step}: ${batonPass.error}`]),
    ...(defaulted.some((notice) => notice['cause'] === NO_ASSISTANT_CAUSE) ? ['no Assistant can come up: open incidents take their defaults'] : []),
  ];
}

function usageTextOf(usage: unknown): string {
  const facts = usage as Partial<UsageDocument> | null;
  if (typeof facts?.resetsAt !== 'string') return 'usage under its limit';
  const window = typeof facts.window === 'string' ? `${facts.window} ` : '';
  return `${window}usage limit hit, resets ${facts.resetsAt.slice(CLOCK_SLICE.start, CLOCK_SLICE.end)}`;
}

interface BoardFigures {
  readonly workerCount:         number;
  readonly buildingCount:       number;
  readonly reviewingCount:      number;
  readonly pausedCount:         number;
  readonly deliveredTodayCount: number;
  readonly tokensToday:         number;
  readonly waitingInQueueCount: number;
}

/** Today is the viewer's local date; the building and reviewing counts are the strip's, so the line, the figure and the strip agree. */
function boardFiguresOf(state: BoardStateDocument, activity: ActivityStripFacts, todayCalendarDate: string): BoardFigures {
  const tasks = state.page?.payload.progress.tasks ?? [];
  const tickets = state.page?.tickets ?? [];
  const isToday = (stamp: string | null): boolean => stamp !== null && stamp.slice(0, CALENDAR_DATE_LENGTH_CHARACTERS) === todayCalendarDate;
  const running = tasks.filter((task) => task.status === 'in-progress' && task.end === null);
  return {
    workerCount:         activity.chips.length,
    buildingCount:       activity.buildingCount,
    reviewingCount:      activity.reviewingCount,
    pausedCount:         (state.page?.payload.boardFacts.tickets ?? []).filter((facts) => facts.displayState === PAUSED_DISPLAY_STATE).length,
    deliveredTodayCount: tickets.filter((ticket) => isToday(ticket.delivered)).length,
    tokensToday:         tasks.filter((task) => running.includes(task) || isToday(task.end)).reduce((total, task) => total + (task.tokens ?? 0), 0),
    waitingInQueueCount: tickets.filter((ticket) => ticket.status === 'pending').length,
  };
}

/**
 * The four board figures, agents against the limit, done today, tokens today and waiting in queue, with the paused figure after
 * the agents while any ticket is paused; then the Bridge's open questions and incidents.
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
    figure(String(state.decisions.length), 'open questions', 'questions'),
    figure(String(state.incidents.length), 'open incidents', 'assistant'),
  ];
}

function agentsExplanationOf(limit: number | null): string {
  const counted = limit === null ? 'Build and review jobs' : `Build and review jobs against the limit of ${limit}`;
  return `${counted}; the Assistant and product-owner jobs do not count`;
}

function summaryLineOf(figures: BoardFigures): SummaryLine {
  return {
    states: [
      { figure: String(figures.buildingCount), label: 'building', state: 'in-progress' },
      { figure: String(figures.reviewingCount), label: 'reviewing', state: 'reviewing' },
      { figure: String(figures.waitingInQueueCount), label: 'waiting in queue', state: 'pending' },
      { figure: String(figures.pausedCount), label: 'paused', state: 'paused' },
    ],
    today: [
      { figure: String(figures.deliveredTodayCount), label: 'done today', state: 'delivered' },
      { figure: TokenCountUtil.formatTokenCount(figures.tokensToday), label: 'tokens today', state: null },
    ],
  };
}

function statusTokenOf(overseer: OverseerFactsDocument | null, connection: ConnectionState): StatusToken {
  if (connection === 'down' || connection === 'no-session') return 'down';
  if (overseer === null || connection === 'connecting') return 'connecting';
  if (overseer.state !== 'serving') return STATUS_TOKEN_OF_RUNTIME_STATE[overseer.state];
  return overseer.paused ? 'paused' : 'live';
}

function headerModelOf(state: BoardStateDocument | null, now: Date, connection: ConnectionState): HeaderModel {
  const overseer = state?.overseer ?? null;
  const notices = state?.notices ?? [];
  const handingOver = overseer?.state === 'passing-baton';
  const newCodeOnDisk = notices.some((notice) => notice.kind === NEW_CODE);
  const answers = overseer !== null && overseer.state !== 'down' && !handingOver;
  const statusToken = statusTokenOf(overseer, connection);
  const activity = state === null ? NO_ACTIVITY : ActivityStripModel.activityStripFactsOf(state.launchSlots, state.jobs, state.page?.tickets ?? []);
  const figures = state === null ? null : boardFiguresOf(state, activity, TimeUtil.calendarDateOf(now.getTime()));
  return {
    statusToken,
    statusLabel:    STATUS_LABEL[statusToken],
    statusDetails:  state === null ? [] : [usageTextOf(state.usage), ...(state.confinement === undefined ? [] : [`confinement ${state.confinement}`])],
    pauseControl:   answers ? (overseer.paused ? 'resume' : 'pause') : null,
    restartOffered: answers && newCodeOnDisk,
    stopOffered:    answers,
    newCodeNotice:  newCodeOnDisk ? `new code: run \`${PRODUCT_NAMES.PROGRAM} update\`` : null,
    statistics:     state === null || figures === null ? [] : statisticsOf(state, figures),
    activity,
    summaryLine:    figures === null ? null : summaryLineOf(figures),
    notices:        notices.filter((notice) => notice.kind !== INCIDENT_DEFAULTED && notice.kind !== NEW_CODE).map(noticeTextOf),
    warnings:       warningsOf(notices, overseer),
  };
}

export const HeaderModelUtil = Object.freeze({ headerModelOf, noticeSentenceOf });
