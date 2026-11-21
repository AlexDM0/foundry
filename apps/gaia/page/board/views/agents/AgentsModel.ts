/**
 * The Agents view's model: which board records are agent jobs, which card a job sits in (the worker list or Sessions) and in what order,
 * its role mark, its open decision as an ask, its calls against its budget, its subagents as squares, its quiet sweeps, the slot meter and
 * the cards' counts and tallies, whether it is stopping or takes a message, as the forge offers, and whether a concurrency limit asked for
 * may be sent within the bounds the forge serves. Which job holds a launch slot is the forge's `launchSlots` fact, never a kind list copied
 * here.
 */
import type { IconName } from 'design-system/Icon';

import type { BoardLaunchSlotsDocument }           from '../../../@types/board/BoardDocument.ts';
import type { BoardConcurrencyBoundsDocument }     from '../../../@types/board/BoardFactDocuments.ts';
import type { BoardDisplayState, BoardResumeWait } from '../../../@types/board/BoardVocabulary.ts';
import { DisplayStateWordingUtil }                 from '../../utils/DisplayStateWordingUtil.ts';
import { JobStateUtil }                            from '../../utils/JobStateUtil.ts';
import { TimeUtil, type TimestampSlices }          from '../../utils/TimeUtil.ts';
import type {
  AgentJobDocument,
  AskingDecisionDocument,
  JobDecisionDocument,
  SubagentDocument
} from './AgentJobDocument.ts';

export type AgentsGroup = 'workers' | 'sessions';

export interface ProjectGroup {
  readonly project: string;
  readonly jobs:    readonly AgentJobDocument[];
}

export interface RoleMark {
  /** The drawing in the role glyph's tile. */
  readonly icon:  IconName;
  /** The lane state the role's work shows in, which colours its glyph, meter and squares. */
  readonly state: BoardDisplayState;
  readonly word:  string;
}

export interface SlotMeterFacts {
  readonly counted:       number;
  readonly limit:         number;
  readonly countedJobIds: readonly string[];
  readonly overLimit:     boolean;
  readonly label:         string;
}

export interface BudgetMeterFacts {
  readonly used:  number;
  /** `null` for a session with no call budget: the meter is unbounded. */
  readonly limit: number | null;
  readonly near:  boolean;
  readonly label: string;
}

export interface SubagentSquare {
  readonly key:       string;
  readonly running:   boolean;
  readonly titleText: string;
}

export interface SubagentSquares {
  readonly squares:    readonly SubagentSquare[];
  readonly figureText: string;
  readonly ariaLabel:  string;
}

export interface JobAsk {
  readonly decisionId:   string;
  readonly questionText: string;
  readonly openedAt:     string | null;
  /** The stamp sliced as every full stamp of the board is; the stamp as stored where the board serves no slices. */
  readonly openedAtText: string | null;
}

export interface SessionTally {
  readonly kind:               'intake' | 'assistant';
  readonly liveCount:          number;
  readonly waitingOnUserCount: number;
}

type GroupedJob = Pick<AgentJobDocument, 'role'>;
type RoleMarkedJob = Pick<AgentJobDocument, 'role' | 'kind'>;
type BudgetedJob = { readonly live: Pick<AgentJobDocument['live'], 'calls' | 'callBudget'> };
type SubagentFacts = Pick<SubagentDocument, 'parentToolUseId' | 'toolCalls' | 'state' | 'description'>;
type JobWithSubagents = { readonly live: { readonly subagents: readonly SubagentFacts[] } };
type AboutJob = Pick<AgentJobDocument, 'role' | 'intake'>;

/** Display only, never a dispatch rule: from this share of its call budget a job's meter and figure take the warn colours. */
export const CALL_BUDGET_WARNING_FRACTION = 0.8;

const SESSION_ROLES: ReadonlySet<string> = new Set(['product-owner', 'assistant', 'pipeline-agent']);

const ROLE_MARKS: Readonly<Record<string, RoleMark>> = {
  'builder':              { icon: 'hammer', state: 'in-progress', word: 'builder' },
  'reviewer':             { icon: 'magnifier', state: 'reviewing', word: 'reviewer' },
  're-reviewer':          { icon: 'magnifier', state: 'reviewing', word: 're-reviewer' },
  'conflict-re-reviewer': { icon: 'magnifier', state: 'reviewing', word: 'conflict re-reviewer' },
  'product-owner':        { icon: 'inbox', state: 'draft', word: 'intake' },
  'assistant':            { icon: 'lifebuoy', state: 'reviewing', word: 'Assistant' },
  'pipeline-agent':       { icon: 'flow', state: 'committed', word: 'pipeline agent' },
};

/** The drawing of each roleless job kind; any other role or kind takes `UNKNOWN_ROLE_ICON`. */
const ROLELESS_KIND_ICONS: Readonly<Record<string, IconName>> = {
  'merge':               'merge',
  'refresh':             'cycle',
  'constitution-commit': 'document',
};

const UNKNOWN_ROLE_ICON: IconName = 'dot';

const ROLELESS_JOB_STATE: BoardDisplayState = 'committed';

function openDecisionOf<Decision extends JobDecisionDocument>(decisions: readonly Decision[], jobId: string): Decision | null {
  return decisions.find((decision) => decision.jobId === jobId) ?? null;
}

/** A session is an intake, Assistant or pipeline agent job; every other job, a roleless merge or refresh among them, is worker work. */
function groupOf(job: GroupedJob): AgentsGroup {
  return job.role !== null && SESSION_ROLES.has(job.role) ? 'sessions' : 'workers';
}

function roleMarkOf(job: RoleMarkedJob): RoleMark {
  if (job.role !== null && Object.hasOwn(ROLE_MARKS, job.role)) {
    const mark = ROLE_MARKS[job.role];
    if (mark !== undefined) return mark;
  }
  const icon = job.role === null && Object.hasOwn(ROLELESS_KIND_ICONS, job.kind) ? ROLELESS_KIND_ICONS[job.kind] : undefined;
  return { icon: icon ?? UNKNOWN_ROLE_ICON, state: ROLELESS_JOB_STATE, word: job.role ?? job.kind };
}

/** The open decision a job asks User, worded from its first question; `null` when no open decision names the job. */
function askOf(decisions: readonly AskingDecisionDocument[], jobId: string, slices: TimestampSlices | null): JobAsk | null {
  const decision = openDecisionOf(decisions, jobId);
  if (decision === null) return null;
  const stamp = decision.openedAt === '' ? null : decision.openedAt;
  return {
    decisionId:   decision.id,
    questionText: decision.questions[0]?.question ?? '',
    openedAt:     stamp,
    openedAtText: stamp === null || slices === null ? stamp : TimeUtil.fullStampText(stamp, slices),
  };
}

/** One group per project (one Overseer serves one board): the jobs that ask User lead, the rest keep board order; none without jobs. */
function projectGroupsOf(jobs: readonly AgentJobDocument[], decisions: readonly JobDecisionDocument[], project: string): ProjectGroup[] {
  if (jobs.length === 0) return [];
  const asking = jobs.filter((job) => openDecisionOf(decisions, job.id) !== null);
  const rest = jobs.filter((job) => openDecisionOf(decisions, job.id) === null);
  return [{ project, jobs: [...asking, ...rest] }];
}

/** The launch slots the forge counts, against the limit. */
function slotMeterOf(launchSlots: BoardLaunchSlotsDocument): SlotMeterFacts {
  const counted = launchSlots.slotJobIds.length;
  return {
    counted,
    limit:         launchSlots.limit,
    countedJobIds: launchSlots.slotJobIds,
    overLimit:     counted > launchSlots.limit,
    label:         `${counted} worker ${counted === 1 ? 'job' : 'jobs'} against a limit of ${launchSlots.limit}`,
  };
}

/** Whether a job holds a launch slot, as the forge served it. */
function isCounted(jobId: string, launchSlots: BoardLaunchSlotsDocument): boolean {
  return launchSlots.slotJobIds.includes(jobId);
}

function budgetMeterOf(job: BudgetedJob): BudgetMeterFacts {
  const { calls, callBudget } = job.live;
  if (callBudget === null) return {
    used: calls, limit: null, near: false, label: `${calls} ${calls === 1 ? 'call' : 'calls'}, no budget`
  };
  return {
    used:  calls,
    limit: callBudget,
    near:  callBudget > 0 && calls / callBudget >= CALL_BUDGET_WARNING_FRACTION,
    label: `${calls} of ${callBudget} calls`,
  };
}

function subagentsAriaLabelOf(runningCount: number, endedCount: number): string {
  const total = runningCount + endedCount;
  if (total === 1) return `1 subagent, ${runningCount === 1 ? 'running' : 'done'}`;
  if (runningCount === 0 || endedCount === 0) {
    const everyOne = total === 2 ? 'both' : 'all';
    return `${total} subagents, ${everyOne} ${runningCount === 0 ? 'done' : 'running'}`;
  }
  return `${total} subagents, ${runningCount} running, ${endedCount} done`;
}

/** One square per subagent in served order, filled while it runs. */
function subagentSquaresOf(job: JobWithSubagents): SubagentSquares {
  const { subagents } = job.live;
  if (subagents.length === 0) return { squares: [], figureText: 'none', ariaLabel: 'no subagents' };
  const squares = subagents.map((subagent) => {
    const running = subagent.state === 'running';
    const toolCallsText = `${subagent.toolCalls} ${subagent.toolCalls === 1 ? 'tool call' : 'tool calls'}`;
    return {
      key:       subagent.parentToolUseId,
      running,
      titleText: `${subagent.description ?? subagent.parentToolUseId} · ${toolCallsText} · ${running ? 'running' : 'done'}`,
    };
  });
  const runningCount = squares.filter((square) => square.running).length;
  const endedCount = squares.length - runningCount;
  const figureParts = [runningCount > 0 ? `${runningCount} running` : null, endedCount > 0 ? `${endedCount} done` : null];
  return {
    squares,
    figureText: figureParts.filter((part) => part !== null).join(' · '),
    ariaLabel:  subagentsAriaLabelOf(runningCount, endedCount),
  };
}

function quietTextOf(silentSweeps: number): string | null {
  if (silentSweeps <= 0) return null;
  return `quiet ${silentSweeps} ${silentSweeps === 1 ? 'sweep' : 'sweeps'}`;
}

/** The Agents card's count: `3 jobs · 2 ask User · 1 quiet`, a part left out at zero, the jobs always named. */
function cardCountTextOf(jobCount: number, askingCount: number, quietCount: number): string {
  const parts = [
    `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'}`,
    askingCount > 0 ? `${askingCount} ${askingCount === 1 ? 'asks' : 'ask'} User` : null,
    quietCount > 0 ? `${quietCount} quiet` : null,
  ];
  return parts.filter((part) => part !== null).join(' · ');
}

/** The Sessions head: the live intake and Assistant jobs, and how many of each wait on User's answer. */
function sessionTalliesOf(jobs: readonly Pick<AgentJobDocument, 'id' | 'role'>[], decisions: readonly JobDecisionDocument[]): SessionTally[] {
  const tallyOf = (kind: SessionTally['kind'], role: string): SessionTally => {
    const roleJobs = jobs.filter((job) => job.role === role);
    return { kind, liveCount: roleJobs.length, waitingOnUserCount: roleJobs.filter((job) => openDecisionOf(decisions, job.id) !== null).length };
  };
  return [tallyOf('intake', 'product-owner'), tallyOf('assistant', 'assistant')];
}

/** The project line of Sessions: `3 sessions · 1 waits on User`, the waiting part left out at zero. */
function sessionsLineTextOf(sessionCount: number, waitingOnUserCount: number): string {
  const sessionsText = `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`;
  return waitingOnUserCount === 0 ? sessionsText : `${sessionsText} · ${waitsOnUserTextOf(waitingOnUserCount)}`;
}

/** `1 waits on User`, `2 wait on User`. */
function waitsOnUserTextOf(waitingOnUserCount: number): string {
  return `${waitingOnUserCount} ${waitingOnUserCount === 1 ? 'waits' : 'wait'} on User`;
}

/** The worker card's project line: `3 jobs here · 4 tickets in progress have no job`, the second part left out at zero. */
function workersLineTextOf(jobCount: number, joblessTicketCount: number): string {
  const jobsText = `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} here`;
  return joblessTicketCount === 0 ? jobsText : `${jobsText} · ${joblessTicketsTextOf(joblessTicketCount)}`;
}

/** `1 ticket in progress has no job`, `4 tickets in progress have no job`. */
function joblessTicketsTextOf(joblessTicketCount: number): string {
  return joblessTicketCount === 1 ? '1 ticket in progress has no job' : `${joblessTicketCount} tickets in progress have no job`;
}

/** The Assistant's tally: `0 incidents open`, `1 incident open`. */
function incidentsOpenTextOf(openIncidentCount: number): string {
  return `${openIncidentCount} ${openIncidentCount === 1 ? 'incident' : 'incidents'} open`;
}

/** What a session is about: an intake's title, else its request; the Assistant's open incidents; a pipeline agent. */
function sessionAboutTextOf(job: AboutJob, openIncidentCount: number): string {
  if (job.role === 'product-owner') return job.intake?.title ?? job.intake?.text ?? 'intake';
  if (job.role === 'assistant') {
    if (openIncidentCount === 0) return 'no open incident';
    return `${openIncidentCount} open ${openIncidentCount === 1 ? 'incident' : 'incidents'}`;
  }
  return 'pipeline agent';
}

function isStopping(job: Pick<AgentJobDocument, 'state' | 'stopRequest'>): boolean {
  return job.state === 'stopping' || job.stopRequest !== null;
}

/** Whether the job takes a message now, as the forge offers it. */
function takesMessages(job: Pick<AgentJobDocument, 'offers'>): boolean {
  return job.offers.takesMessage;
}

/** "followed live · 11 entries": the transcript head says it follows the job and how much it holds. */
function transcriptCountTextOf(entryCount: number): string {
  return `followed live · ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`;
}

/** The head of the job panel: the job's state, then how long ago it launched where the log holds its launch. */
/** Gaia's words for what a waiting job follows; the forge decides which it is, and Gaia only words it. */
const RESUME_WAIT_TEXT: Readonly<Record<BoardResumeWait, string>> = {
  instruction: 'Waits for your resume.',
  answer:      'Resumes once its question is answered.',
  decision:    'Resumes once its decision is answered.',
  nothing:     'Resumes by itself at the forge\'s next pass.',
  never:       'No resume restarts it.',
};

function resumeWaitTextOf(waitsFor: BoardResumeWait): string {
  return RESUME_WAIT_TEXT[waitsFor];
}

/** A job's raw state, or the words of the wait its interruption names: a network outage, or the forge's lost supervision. */
function stateTextOf(job: Pick<AgentJobDocument, 'state' | 'interruption'>): string {
  const waitState = JobStateUtil.interruptionWaitStateOf(job);
  return waitState === null ? job.state : DisplayStateWordingUtil.labelOf(waitState);
}

function panelStateTextOf(job: Pick<AgentJobDocument, 'state' | 'interruption'>, launchedText: string | null): string {
  return launchedText === null ? stateTextOf(job) : `${stateTextOf(job)} · ${launchedText}`;
}

/** A limit to send: a whole number within the bounds the forge serves, which it refuses past, that differs from the current one. */
function concurrencyLimitIsSendable(wantedLimit: number, currentLimit: number, bounds: Pick<BoardConcurrencyBoundsDocument, 'lowest' | 'ceiling'>): boolean {
  return wantedLimit !== currentLimit && Number.isInteger(wantedLimit) && wantedLimit >= bounds.lowest && wantedLimit <= bounds.ceiling;
}

export const AgentsModel = Object.freeze({
  openDecisionOf,
  groupOf,
  roleMarkOf,
  askOf,
  projectGroupsOf,
  slotMeterOf,
  isCounted,
  budgetMeterOf,
  subagentSquaresOf,
  quietTextOf,
  cardCountTextOf,
  sessionTalliesOf,
  sessionsLineTextOf,
  waitsOnUserTextOf,
  workersLineTextOf,
  joblessTicketsTextOf,
  incidentsOpenTextOf,
  sessionAboutTextOf,
  isStopping,
  takesMessages,
  stateTextOf,
  resumeWaitTextOf,
  panelStateTextOf,
  transcriptCountTextOf,
  concurrencyLimitIsSendable,
});
