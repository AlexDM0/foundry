/**
 * The Agents view's model: which board records are agent jobs, which card a job sits in (the worker list or Sessions) and in what order,
 * its role mark, its open decision as an ask, its calls against its budget, its subagents as squares, its quiet sweeps, the slot meter and
 * the cards' counts and tallies, whether it is stopping, and whether a concurrency limit asked for may be sent; and
 * Flint's brain's own row, which is no job. Which job holds a launch slot is the Overseer's `launchSlots` fact, never a kind list copied
 * here.
 */
import type { IconName }                  from 'design-system/Icon';
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import { TokenCountUtil }                                                    from '../../../src/lib/token-count/TokenCountUtil.ts';
import type { DisplayState }                                                 from '../../../src/lib/tracker-model/@types/Task.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS, LOWEST_CONCURRENCY_LIMIT_AGENTS } from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import type { IdentifiedRecord, LaunchSlotsDocument }                        from '../../@types/BoardStateDocument.ts';
import { ElapsedTimeUtil }                                                   from '../../utils/ElapsedTimeUtil.ts';
import { TimeUtil, type TimestampSlices }                                    from '../../utils/TimeUtil.ts';
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
  readonly state: DisplayState;
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
  /** The stamp sliced as every full stamp of the Bridge is; the stamp as stored where the board serves no slices. */
  readonly openedAtText: string | null;
}

export interface SessionTally {
  readonly kind:               'intake' | 'assistant';
  readonly liveCount:          number;
  readonly waitingOnUserCount: number;
}

/** The brain's states that show a row; `off` shows none. */
export type FlintBrainRowState = 'starting' | 'running' | 'ended' | 'refused';

export interface FlintBrainRow {
  readonly state:          FlintBrainRowState;
  readonly stateLabel:     string;
  /** The run ended because its session failed: the one state worded as a failure. */
  readonly endedInFailure: boolean;
  /** `haiku · low`; `null` while the forge names neither. */
  readonly modelText:      string | null;
  readonly tokensText:     string | null;
  readonly callsText:      string | null;
  /** The time left of a running brain, `1m 42s left`; `null` in every other state. */
  readonly countdownText:  string | null;
  /** The forge's own words for an ended or refused brain. */
  readonly sentence:       string | null;
  readonly stopOffered:    boolean;
}

const FLINT_BRAIN_STATE_LABELS: Readonly<Record<FlintBrainRowState, string>> = {
  starting: 'Starting',
  running:  'Running',
  ended:    'Ended',
  refused:  'Refused',
};

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

const ROLELESS_JOB_STATE: DisplayState = 'committed';

/** A record without live facts is not shown rather than breaking the table: the next `board` carries the whole job again. */
function isAgentJob(record: IdentifiedRecord): record is AgentJobDocument {
  const { live, ticketIds, state } = record as Partial<AgentJobDocument>;
  return typeof live === 'object' && live !== null && Array.isArray(live.subagents) && Array.isArray(ticketIds) && typeof state === 'string';
}

function openDecisionOf(decisions: readonly IdentifiedRecord[], jobId: string): JobDecisionDocument | null {
  return decisions.find((decision): decision is JobDecisionDocument => (decision as Partial<JobDecisionDocument>).jobId === jobId) ?? null;
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
function askOf(decisions: readonly IdentifiedRecord[], jobId: string, slices: TimestampSlices | null): JobAsk | null {
  const decision = openDecisionOf(decisions, jobId);
  if (decision === null) return null;
  const { questions, openedAt } = decision as Partial<AskingDecisionDocument>;
  const stamp = typeof openedAt === 'string' ? openedAt : null;
  return {
    decisionId:   decision.id,
    questionText: Array.isArray(questions) ? questions[0]?.question ?? '' : '',
    openedAt:     stamp,
    openedAtText: stamp === null || slices === null ? stamp : TimeUtil.fullStampText(stamp, slices),
  };
}

/** One group per project (one Overseer serves one board): the jobs that ask User lead, the rest keep board order; none without jobs. */
function projectGroupsOf(jobs: readonly AgentJobDocument[], decisions: readonly IdentifiedRecord[], project: string): ProjectGroup[] {
  if (jobs.length === 0) return [];
  const asking = jobs.filter((job) => openDecisionOf(decisions, job.id) !== null);
  const rest = jobs.filter((job) => openDecisionOf(decisions, job.id) === null);
  return [{ project, jobs: [...asking, ...rest] }];
}

/** The launch slots the Overseer counts, against the limit; `null` on a board that serves no launch slots. */
function slotMeterOf(launchSlots: LaunchSlotsDocument | null): SlotMeterFacts | null {
  if (launchSlots === null) return null;
  const counted = launchSlots.slotJobIds.length;
  return {
    counted,
    limit:         launchSlots.limit,
    countedJobIds: launchSlots.slotJobIds,
    overLimit:     counted > launchSlots.limit,
    label:         `${counted} worker ${counted === 1 ? 'job' : 'jobs'} against a limit of ${launchSlots.limit}`,
  };
}

/** Whether a job holds a launch slot, as the Overseer served it; on a board that serves no launch slots, no job is marked either way. */
function isCounted(jobId: string, launchSlots: LaunchSlotsDocument | null): boolean | null {
  return launchSlots === null ? null : launchSlots.slotJobIds.includes(jobId);
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

/** One square per subagent in served order, filled while it runs; a subagent whose state an older board left out reads as ended. */
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
function sessionTalliesOf(jobs: readonly Pick<AgentJobDocument, 'id' | 'role'>[], decisions: readonly IdentifiedRecord[]): SessionTally[] {
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
  return job.state === 'stopping' || job.stopRequest !== undefined;
}

/** A job with a role takes a message while it is not stopping. */
function takesMessages(job: Pick<AgentJobDocument, 'role' | 'state' | 'stopRequest'>): boolean {
  return job.role !== null && !isStopping(job);
}

/** "followed live · 11 entries": the transcript head says it follows the job and how much it holds. */
function transcriptCountTextOf(entryCount: number): string {
  return `followed live · ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`;
}

/** The head of the job panel: the job's state, then how long ago it launched where the log holds its launch. */
function panelStateTextOf(job: Pick<AgentJobDocument, 'state'>, launchedText: string | null): string {
  return launchedText === null ? job.state : `${job.state} · ${launchedText}`;
}

/** A limit to send: a whole number from the lowest limit to the ceiling, which the Overseer refuses past, that differs from the current one. */
function concurrencyLimitIsSendable(wantedLimit: number, currentLimit: number): boolean {
  return wantedLimit !== currentLimit && Number.isInteger(wantedLimit)
    && wantedLimit >= LOWEST_CONCURRENCY_LIMIT_AGENTS && wantedLimit <= CONCURRENCY_LIMIT_CEILING_AGENTS;
}

function countTextOf(count: number | null, singular: string, plural: string): string | null {
  return count === null ? null : `${count} ${count === 1 ? singular : plural}`;
}

/** Flint's brain's row: `null` for a forge without the brain and for a brain that is off. The countdown is display only. */
function flintBrainRowOf(reading: MonitorFlintBrainDocument | null, now: Date): FlintBrainRow | null {
  if (reading === null || reading.state === 'off') return null;
  const { state, endsAt } = reading;
  const modelParts = [reading.model, reading.effort].filter((part) => part !== null);
  const remainingMilliseconds = state === 'running' && endsAt !== null ? Date.parse(endsAt) - now.getTime() : Number.NaN;
  return {
    state,
    stateLabel:     FLINT_BRAIN_STATE_LABELS[state],
    endedInFailure: state === 'ended' && reading.endedReason === 'failed',
    modelText:      modelParts.length === 0 ? null : modelParts.join(' · '),
    tokensText:     reading.tokens === null ? null : `${TokenCountUtil.formatTokenCount(reading.tokens)} tokens`,
    callsText:      countTextOf(reading.calls, 'call', 'calls'),
    countdownText:  Number.isNaN(remainingMilliseconds) ? null : `${ElapsedTimeUtil.formatElapsed(remainingMilliseconds)} left`,
    sentence:       state === 'ended' || state === 'refused' ? reading.sentence ?? reading.refusal?.sentence ?? null : null,
    stopOffered:    state === 'starting' || state === 'running',
  };
}

export const AgentsModel = Object.freeze({
  isAgentJob,
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
  panelStateTextOf,
  transcriptCountTextOf,
  concurrencyLimitIsSendable,
  flintBrainRowOf,
});
