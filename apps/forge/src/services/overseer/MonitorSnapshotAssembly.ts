/**
 * The `MonitorSnapshot` of `GET /api/monitor` and of each `monitor` event, from the same reading as the Overseer's `BoardState`: the
 * Waiting on User list, the notices, the warnings and today's figures as the Bridge computes them, each job's live facts, the newest usage
 * window a session reported, the newest log entries a person cares about, worded as the Bridge words a log entry, and Flint's brain, which
 * is no job and so never in `jobs`. On a forge with entities only, its entities, each open ticket's entity and stage, and each job's.
 */
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import { LogUtil }                       from '../../adapters/utils/LogUtil.ts';
import { LocalTimeUtil }                 from '../../lib/local-time/LocalTimeUtil.ts';
import type { Decision }                 from '../../lib/tracker-model/@types/Decision.ts';
import type { Incident }                 from '../../lib/tracker-model/@types/Incident.ts';
import type { LogRecord, LogRecordKind } from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                 from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }                    from '../../lib/tracker-model/Board.ts';
import { SETTLED_TICKET_STATUSES }       from '../../lib/tracker-model/constants/Statuses.ts';
import { TicketStageUtil }               from '../../lib/tracker-model/utils/TicketStageUtil.ts';
import { SERVED_CONTRACT_VERSIONS }      from '../../shared/constants/OverseerApiContracts.ts';
import { TIMESTAMP_SLICES }              from '../../shared/constants/TimestampSlices.ts';
import type {
  ActivityCategory,
  MonitorActivityEntry,
  MonitorJob,
  MonitorOverseerState,
  MonitorSnapshot,
  MonitorUsage
} from '../../shared/monitor/@types/MonitorSnapshot.ts';
import { attentionEntriesOf }                                              from '../../shared/monitor/AttentionEntries.ts';
import { flintBrainRunsOf, todayFiguresOf }                                from '../../shared/monitor/TodayFigures.ts';
import { BridgeFragmentUtil }                                              from '../../shared/monitor/utils/BridgeFragmentUtil.ts';
import { NoticeWordingUtil, type BatonPassWarningFacts, type NoticeFacts } from '../../shared/monitor/utils/NoticeWordingUtil.ts';
import { OpenDecisionsUtil }                                               from '../../shared/monitor/utils/OpenDecisionsUtil.ts';
import type { BoardState, JobWithLiveFacts }                               from './BoardState.ts';
import type { UsageWindowReport }                                          from './JobLiveFactsReader.ts';

/** What the Overseer knows of itself and no board file holds; read at each snapshot, so a Baton taken over or new code on disk shows. */
export interface MonitorOverseerFacts {
  trackerId:         string;
  root:              string;
  state:             MonitorOverseerState;
  url:               string;
  processId:         number;
  startedAt:         string;
  generation:        number;
  codeVersion:       string;
  /** The code version the program on disk answered last; the one in memory until it answered. */
  codeVersionOnDisk: string;
  installVersion:    number;
  /** The machine-wide agent limit, every board's agent jobs holding a slot, and this board's tickets the limit holds back. */
  machine:           MonitorMachineFacts;
}

export interface MonitorMachineFacts {
  limit:                        number;
  agentsInFlight:               number;
  ticketsWaitingForMachineSlot: number;
}

export interface MonitorSnapshotSource {
  state:      BoardState;
  project:    string;
  board:      Pick<Board, 'concurrency' | 'readyTicketEntries' | 'ticketCountByStatus' | 'pipeline' | 'tickets' | 'ticketStageOf'>;
  logRecords: readonly LogRecord[];
  overseer:   MonitorOverseerFacts;
  /** The Overseer's reading of Flint's brain; `null` where it cannot run confined. */
  flintBrain: MonitorFlintBrainDocument | null;
  /** Today is this moment's local calendar date; the moment is only shown, never compared. */
  now:        Date;
}

/** Which log records a person cares about, and under which heading; `null` keeps the record out of `activity`. Every kind decides. */
const ACTIVITY_CATEGORY_OF_KIND: Readonly<Record<LogRecordKind, ActivityCategory | null>> = {
  'note':                            'forge',
  'ticket-filed':                    'needs-user',
  'merge-queued':                    'forge',
  'merge-acceptance-set':            null,
  'merge-updated':                   null,
  'ticket-readied':                  'forge',
  'ticket-submitted-for-review':     'needs-user',
  'worktree-repaired':               null,
  'ticket-reopened':                 'forge',
  'ticket-started':                  'agent',
  'ticket-finished':                 'agent',
  'ticket-approved':                 'agent',
  'ticket-delivered':                'landed',
  'ticket-abandoned':                'forge',
  'ticket-retitled':                 null,
  'ticket-body-changed-after-claim': null,
  'ticket-rereviewed':               'agent',
  'ticket-priority-changed':         null,
  'ticket-size-changed':             null,
  'ticket-dependencies-set':         null,
  'ticket-introduced-by-set':        null,
  'ticket-agents-changed':           null,
  'ticket-held':                     'forge',
  'ticket-unheld':                   'forge',
  'ticket-release-marked':           null,
  'ticket-release-cleared':          null,
  'ticket-epics-set':                null,
  'ticket-network-set':              null,
  'entity-assigned':                 null,
  'need-declared':                   'agent',
  'stage-started':                   'agent',
  'seal-set':                        null,
  'seal-lifted':                     null,
  'package-return':                  'agent',
  'ticket-check-command-restamped':  null,
  'epic-added':                      null,
  'epic-edited':                     null,
  'epic-removed':                    null,
  'draft-opened':                    'forge',
  'draft-claimed':                   null,
  'draft-released':                  null,
  'draft-closed':                    'forge',
  'draft-abandoned':                 'forge',
  'draft-note-added':                null,
  'draft-question-asked':            'needs-user',
  'draft-question-answered':         'forge',
  'draft-item-dropped':              null,
  'review-bar-started':              null,
  'review-bar-closed':               null,
  'review-recorded':                 'agent',
  'chart-range-set':                 null,
  'concurrency-limit-set':           'forge',
  'overseer-set':                    'forge',
  'dispatcher-set':                  null,
  'pipeline-prepare-step-set':       null,
  'pipeline-gate-added':             null,
  'pipeline-gates-none':             null,
  'pipeline-gate-removed':           null,
  'pipeline-approval-set':           null,
  'pipeline-reach-set':              null,
  'branch-namespace-set':            null,
  'pipeline-gates-ordered':          null,
  'pipeline-setup-opened':           'forge',
  'pipeline-setup-billing-set':      null,
  'pipeline-setup-step-moved':       'forge',
  'pipeline-step-ready-suggested':   'needs-user',
  'pipeline-setup-resumed':          'forge',
  'pipeline-snapshot-touched':       'forge',
  'pipeline-finding-recorded':       'agent',
  'pipeline-question-asked':         'needs-user',
  'pipeline-question-answered':      'forge',
  'pipeline-constitution-set':       'forge',
  'pipeline-draft-edited':           null,
  'pipeline-draft-undone':           null,
  'pipeline-draft-discarded':        'forge',
  'pipeline-setup-discarded':        'forge',
  'gate-profile-requested':          null,
  'gate-profiled':                   'forge',
  'gate-profile-stopped':            null,
  'pipeline-check-requested':        null,
  'pipeline-apply-requested':        'forge',
  'pipeline-apply-held':             'needs-user',
  'pipeline-apply-refused':          'needs-user',
  'pipeline-apply-cancelled':        'forge',
  'pipeline-applied':                'forge',
  'check-command-set':               null,
  'install-command-set':             null,
  'checks-definition-files-set':     null,
  'gate-key-command-set':            null,
  'gate-cache-paths-set':            null,
  'gate-ran':                        'forge',
  'tracker-cleared':                 'forge',
  'overseer-started':                'forge',
  'overseer-stopped':                'forge',
  'flint-brain-ended':               'agent',
  'baton-pass-failed':               'forge',
  'job-launched':                    'agent',
  'job-interrupted':                 'agent',
  'job-resumed':                     'agent',
  'usage-limit-hit':                 'agent',
  'job-stop-requested':              'agent',
  'job-messaged':                    null,
  'job-reopened':                    'agent',
  'intake-titled':                   null,
  'job-ended':                       'agent',
  'decision-opened':                 'needs-user',
  'decision-answered':               'forge',
  'decision-withdrawn':              'forge',
  'incident-opened':                 'forge',
  'incident-handled':                'forge',
  'incident-defaulted':              'forge',
  'incident-escalated':              'needs-user',
  'incident-noted':                  null,
  'incident-answered':               'forge',
  'merge-started':                   'forge',
  'merge-landed':                    'landed',
  'hatch-applied':                   null,
  'agent-stopped':                   null,
};

const BRIDGE_TABS_OF_SUBJECTS = {
  QUESTIONS: 'questions',
  KANBAN:    'kanban',
  AGENTS:    'agents',
  ASSISTANT: 'assistant',
} as const;

const MONITOR_ACTIVITY_ENTRIES = 50;

const RUNNING_SUBAGENT_STATE = 'running';

const QUIET_JOB_INCIDENT_KIND = 'quiet-job';

const FLINT_BRAIN_ACTIVITY_KIND = 'flint-brain';

/** The Bridge route a record's subject opens: its question, its ticket or draft on the Kanban, its job or the Assistant; `null` for the board's own. */
function activityRouteOf(record: LogRecord): string | null {
  if ('decisionId' in record) return BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.QUESTIONS, record.decisionId);
  if ('jobId' in record) return BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.AGENTS, record.jobId);
  if ('ticketId' in record) return BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.KANBAN, BridgeFragmentUtil.detailItemTextOf('ticket', record.ticketId));
  if ('draftId' in record) return BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.KANBAN, BridgeFragmentUtil.detailItemTextOf('draft', record.draftId));
  if ('incidentId' in record) return BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.ASSISTANT, null);
  return null;
}

/** The newest entries a person cares about, oldest first, as the log reads. */
function activityOf(logRecords: readonly LogRecord[]): MonitorActivityEntry[] {
  const entries: MonitorActivityEntry[] = [];
  for (let logPosition = logRecords.length - 1; logPosition >= 0 && entries.length < MONITOR_ACTIVITY_ENTRIES; logPosition -= 1) {
    const record = logRecords[logPosition];
    const category = record === undefined ? null : ACTIVITY_CATEGORY_OF_KIND[record.kind];
    if (record === undefined || category === null) continue;
    const entry = {
      logPosition, at: record.at, category, text: LogUtil.sentenceOf(record), route: activityRouteOf(record)
    };
    entries.push(record.kind === 'flint-brain-ended' ? { ...entry, kind: FLINT_BRAIN_ACTIVITY_KIND, tokens: record.fields.tokens } : entry);
  }
  return entries.reverse();
}

function jobOf(job: JobWithLiveFacts, decisions: readonly Decision[], incidents: readonly Incident[], titleOf: (ticketId: string) => string | null): MonitorJob {
  const { live } = job;
  const firstTicketId = job.ticketIds[0];
  return {
    id:                  job.id,
    kind:                job.kind,
    role:                job.role,
    state:               job.state,
    ticketIds:           [...job.ticketIds],
    ticketTitle:         firstTicketId === undefined ? null : titleOf(firstTicketId),
    attempt:             job.attempt,
    startedAt:           job.launchedAt ?? '',
    calls:               live.calls,
    callBudget:          live.callBudget,
    tokens:              live.tokens,
    toolCalls:           live.toolCalls,
    lastToolCall:        live.lastToolCall?.toolName ?? null,
    runningSubagents:    live.subagents.filter((subagent) => subagent.state === RUNNING_SUBAGENT_STATE).length,
    silentSweeps:        live.silentSweeps,
    quiet:               incidents.some((incident) => incident.kind === QUIET_JOB_INCIDENT_KIND && incident.jobId === job.id),
    turn:                live.turn,
    messagesWaiting:     live.messagesWaiting,
    lastLine:            live.lastLine?.text ?? null,
    waitingOnDecisionId: OpenDecisionsUtil.answeringOrderOf(decisions).find((decision) => decision.jobId === job.id)?.id ?? null,
    route:               BridgeFragmentUtil.fragmentOf(BRIDGE_TABS_OF_SUBJECTS.AGENTS, job.id),
    ...jobEntityKeysOf(job),
  };
}

/** Written only once set, so a job of a forge without entities keeps exactly today's keys. */
function jobEntityKeysOf(job: JobWithLiveFacts): Pick<MonitorJob, 'entity' | 'stage'> {
  if (job.entity === undefined) return {};
  const stage = TicketStageUtil.stageOfJob(job);
  return stage === null ? { entity: job.entity } : { entity: job.entity, stage: stage.name };
}

/** Absent keys on a forge without entities, so its snapshot stays exactly today's. */
function snapshotEntityKeysOf(board: MonitorSnapshotSource['board']): Pick<MonitorSnapshot, 'entities' | 'openTickets'> {
  const entities = board.pipeline()?.entities;
  if (entities === undefined) return {};
  return {
    entities:    entityDocumentsOf(entities),
    openTickets: board.tickets()
      .filter((ticket) => !SETTLED_TICKET_STATUSES.includes(ticket.frontmatter.status))
      .map(({ frontmatter }) => {
        const stage = board.ticketStageOf(frontmatter.id);
        return { id: frontmatter.id, entity: frontmatter.entity ?? null, stage: stage === null ? null : { name: stage.name, entity: stage.entity } };
      }),
  };
}

function entityDocumentsOf(entities: NonNullable<Pipeline['entities']>): NonNullable<MonitorSnapshot['entities']> {
  return Object.entries(entities).map(([key, entity]) => ({ key, kind: entity.kind, home: [...entity.home] }));
}

/** The state carries the notices as the DrivePass derived them; one that names no kind is no notice. */
function noticeFactsIn(notices: readonly unknown[]): NoticeFacts[] {
  return notices.filter((notice): notice is NoticeFacts => typeof notice === 'object' && notice !== null && typeof (notice as { kind?: unknown }).kind === 'string');
}

function batonPassWarningIn(warning: unknown): BatonPassWarningFacts | null {
  if (typeof warning !== 'object' || warning === null) return null;
  const { successorCodeVersion, step, error } = warning as Partial<Record<keyof BatonPassWarningFacts, unknown>>;
  return typeof successorCodeVersion === 'string' && typeof step === 'string' && typeof error === 'string' ? { successorCodeVersion, step, error } : null;
}

/** A report with no stamp, from a log written before stamps, or with a stamp that does not read, is older than any stamped one. */
function reportedInstantOf(report: UsageWindowReport): number {
  if (report.reportedAt === null) return Number.NEGATIVE_INFINITY;
  return LocalTimeUtil.parseIso(report.reportedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

/**
 * The newest report across the board's jobs, its reset passed on as reported, never compared with now. A stated exception to "a clock
 * decides nothing": the report stamps decide only which report is shown.
 */
function currentUsageWindowOf(jobs: readonly JobWithLiveFacts[]): Pick<MonitorUsage, 'currentWindow' | 'currentWindowResetsAt'> {
  const newest = jobs.reduce<UsageWindowReport | null>((latest, job) => {
    const report = job.live.usageWindow;
    if (report === null) return latest;
    return latest === null || reportedInstantOf(report) > reportedInstantOf(latest) ? report : latest;
  }, null);
  return { currentWindow: newest?.window ?? null, currentWindowResetsAt: newest?.resetsAt ?? null };
}

function monitorSnapshotOf(source: MonitorSnapshotSource): MonitorSnapshot {
  const { state, board, overseer } = source;
  const notices = noticeFactsIn(state.notices);
  const ticketTitleById = new Map((state.page.tickets).map((ticket) => [ticket.id, ticket.title]));
  const { limit, agentsInFlight } = board.concurrency();
  const todayCalendarDate = LocalTimeUtil.formatLocalIso(source.now).slice(0, TIMESTAMP_SLICES.CALENDAR_DATE_LENGTH_CHARACTERS);
  return {
    monitorVersion: SERVED_CONTRACT_VERSIONS.monitor,
    trackerId:      overseer.trackerId,
    project:        source.project,
    root:           overseer.root,
    overseer:       {
      state:             overseer.state,
      paused:            state.overseer.paused,
      url:               overseer.url,
      processId:         overseer.processId,
      startedAt:         overseer.startedAt,
      generation:        overseer.generation,
      codeVersion:       overseer.codeVersion,
      codeVersionOnDisk: overseer.codeVersionOnDisk,
      installVersion:    overseer.installVersion,
    },
    concurrency: {
      limit,
      agentsInFlight,
      machineLimit:                 overseer.machine.limit,
      machineAgentsInFlight:        overseer.machine.agentsInFlight,
      ticketsWaitingForMachineSlot: overseer.machine.ticketsWaitingForMachineSlot,
    },
    ticketCountByStatus: board.ticketCountByStatus(),
    readyTicketIds:      board.readyTicketEntries().map((ready) => ready.id),
    openIncidents:       state.incidents.length,
    attention:           attentionEntriesOf(state),
    jobs:                state.jobs.map((job) => jobOf(job, state.decisions, state.incidents, (ticketId) => ticketTitleById.get(ticketId) ?? null)),
    notices:             notices.map((notice) => ({ kind: notice.kind, text: NoticeWordingUtil.noticeSentenceOf(notice) })),
    warnings:            NoticeWordingUtil.warningsOf(notices, batonPassWarningIn(state.overseer.batonPassWarning)),
    today:               todayFiguresOf(state, todayCalendarDate, flintBrainRunsOf(source.logRecords, source.flintBrain)),
    usage:               { resetsAt: state.usage.resetsAt, window: state.usage.window, ...currentUsageWindowOf(state.jobs) },
    activity:            activityOf(source.logRecords),
    flintBrain:          source.flintBrain,
    ...snapshotEntityKeysOf(board),
  };
}

export const MonitorSnapshotAssembly = Object.freeze({ monitorSnapshotOf, activityOf });
