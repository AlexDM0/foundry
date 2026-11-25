/**
 * The `MonitorSnapshot` of `GET /api/monitor` and of each `monitor` event, from the same reading as Hephaestus's `BoardState`: the
 * Waiting on User list, the notices, the warnings and today's figures as the board document carries them, each job's live facts, the newest usage
 * window a session reported and the newest log entries a person cares about, worded as the board document words a log entry. On a forge with
 * entities only, its entities, each open ticket's entity and stage, and each job's.
 */
import type { BoardTarget } from 'forge-contracts/BoardReadingDocuments';

import type { JobWithLiveFacts, UsageWindowReport } from '../../adapters/@types/BoardStateParts.ts';
import { MONITOR_INTERRUPTION_CAUSE_OF_CAUSE }      from '../../adapters/constants/MonitorInterruptionCauseOfCause.ts';
import { LogUtil }                                  from '../../adapters/utils/LogUtil.ts';
import { LocalTimeUtil }                            from '../../lib/local-time/LocalTimeUtil.ts';
import type { Decision }                            from '../../lib/tracker-model/@types/Decision.ts';
import type { Incident }                            from '../../lib/tracker-model/@types/Incident.ts';
import type { JobKind }                             from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord, LogRecordKind }            from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { Board }                               from '../../lib/tracker-model/Board.ts';
import { SETTLED_TICKET_STATUSES }                  from '../../lib/tracker-model/constants/Statuses.ts';
import { TicketStageUtil }                          from '../../lib/tracker-model/utils/TicketStageUtil.ts';
import { SERVED_CONTRACT_VERSIONS }                 from '../../shared/constants/HephaestusApiContracts.ts';
import type {
  ActivityCategory,
  MonitorActivityEntry,
  MonitorJob,
  MonitorHephaestusState,
  MonitorSnapshot,
  MonitorUsage
} from '../../shared/monitor/@types/MonitorSnapshot.ts';
import { attentionEntriesOf }                  from '../../shared/monitor/AttentionEntries.ts';
import { todayCalendarDateOf, todayFiguresOf } from '../../shared/monitor/TodayFigures.ts';
import { NoticeWordingUtil }                   from '../../shared/monitor/utils/NoticeWordingUtil.ts';
import { OpenDecisionsUtil }                   from '../../shared/monitor/utils/OpenDecisionsUtil.ts';
import type { BoardState }                     from './BoardState.ts';
import { DraftProgressReading }                from './DraftProgressReading.ts';

/** What Hephaestus knows of itself and no board file holds; read at each snapshot, so a Hephaestus lock taken over or new code on disk shows. */
export interface MonitorHephaestusFacts {
  trackerId:         string;
  root:              string;
  state:             MonitorHephaestusState;
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
  board:      Pick<Board, 'concurrency' | 'readyTicketEntries' | 'ticketCountByStatus' | 'pipeline' | 'tickets' | 'ticketStageOf' | 'ticketDocumentRecordOf'>;
  logRecords: readonly LogRecord[];
  hephaestus: MonitorHephaestusFacts;
  /** Today is this moment's local calendar date; the moment is only shown, never compared. */
  now:        Date;
}

/** Which log records a person cares about, and under which heading; `null` keeps the record out of `activity`. Every kind decides. */
const ACTIVITY_CATEGORY_OF_KIND: Readonly<Record<LogRecordKind, ActivityCategory | null>> = {
  'note':                             'forge',
  'ticket-filed':                     'needs-user',
  'merge-queued':                     'forge',
  'merge-acceptance-set':             null,
  'merge-updated':                    null,
  'ticket-committed':                 'forge',
  'ticket-submitted-for-review':      'needs-user',
  'worktree-repaired':                null,
  'ticket-reopened':                  'forge',
  'ticket-unreadied':                 'forge',
  'ticket-started':                   'agent',
  'ticket-finished':                  'agent',
  'ticket-approved':                  'agent',
  'ticket-delivered':                 'landed',
  'ticket-abandoned':                 'forge',
  'ticket-retitled':                  null,
  'ticket-content-restored':          null,
  'ticket-rereviewed':                'agent',
  'ticket-priority-changed':          null,
  'ticket-size-changed':              null,
  'ticket-dependencies-set':          null,
  'ticket-introduced-by-set':         null,
  'ticket-agents-changed':            null,
  'ticket-held':                      'forge',
  'ticket-unheld':                    'forge',
  'ticket-interrupted-hold-lifted':   'forge',
  'ticket-release-marked':            null,
  'ticket-release-cleared':           null,
  'ticket-grouped':                   null,
  'ticket-epics-set':                 null,
  'ticket-network-set':               null,
  'entity-assigned':                  null,
  'ticket-documents-opened':          null,
  'ticket-document-versioned':        null,
  'ticket-document-approved':         null,
  'ticket-document-message-queued':   null,
  'ticket-document-proposed':         null,
  'ticket-document-proposal-settled': null,
  'ticket-document-mode-set':         null,
  'ticket-document-snapshot-touched': null,
  'need-declared':                    'agent',
  'dependent-fix-filed':              'forge',
  'stage-started':                    'agent',
  'seal-set':                         null,
  'seal-lifted':                      null,
  'package-return':                   'agent',
  'ticket-check-command-restamped':   null,
  'epic-added':                       null,
  'epic-edited':                      null,
  'epic-removed':                     null,
  'draft-opened':                     'forge',
  'draft-claimed':                    null,
  'draft-released':                   null,
  'draft-closed':                     'forge',
  'draft-abandoned':                  'forge',
  'draft-note-added':                 null,
  'draft-question-asked':             'needs-user',
  'draft-question-answered':          'forge',
  'draft-item-dropped':               null,
  'review-bar-started':               null,
  'review-bar-closed':                null,
  'review-recorded':                  'agent',
  'chart-range-set':                  null,
  'concurrency-limit-set':            'forge',
  'hephaestus-set':                   'forge',
  'dispatcher-set':                   null,
  'pipeline-prepare-step-set':        null,
  'pipeline-gate-added':              null,
  'pipeline-gates-none':              null,
  'pipeline-gate-removed':            null,
  'pipeline-approval-set':            null,
  'pipeline-assistant-set':           null,
  'pipeline-agent-set':               null,
  'pipeline-tools-set':               null,
  'pipeline-setup-agent-set':         null,
  'job-not-launched':                 'needs-user',
  'job-launch-retried':               null,
  'pipeline-reach-set':               null,
  'branch-namespace-set':             null,
  'pipeline-gates-ordered':           null,
  'pipeline-setup-opened':            'forge',
  'pipeline-setup-billing-set':       null,
  'pipeline-setup-step-moved':        'forge',
  'pipeline-step-ready-suggested':    'needs-user',
  'pipeline-setup-resumed':           'forge',
  'pipeline-snapshot-touched':        'forge',
  'pipeline-finding-recorded':        'agent',
  'pipeline-question-asked':          'needs-user',
  'pipeline-question-answered':       'forge',
  'pipeline-constitution-set':        'forge',
  'pipeline-draft-edited':            null,
  'pipeline-draft-undone':            null,
  'pipeline-draft-discarded':         'forge',
  'pipeline-setup-discarded':         'forge',
  'gate-profile-requested':           null,
  'gate-profiled':                    'forge',
  'gate-profile-stopped':             null,
  'pipeline-check-requested':         null,
  'pipeline-apply-requested':         'forge',
  'pipeline-apply-held':              'needs-user',
  'pipeline-apply-refused':           'needs-user',
  'pipeline-apply-cancelled':         'forge',
  'pipeline-applied':                 'forge',
  'check-command-set':                null,
  'install-command-set':              null,
  'checks-definition-files-set':      null,
  'gate-key-command-set':             null,
  'gate-cache-paths-set':             null,
  'gate-ran':                         'forge',
  'pipeline-step-ran':                null,
  'tracker-cleared':                  'forge',
  'hephaestus-started':               'forge',
  'hephaestus-stopped':               'forge',
  'start-classified':                 'forge',
  'flint-brain-ended':                'agent',
  'restart-failed':                   'forge',
  'job-launched':                     'agent',
  'job-interrupted':                  'agent',
  'job-resumed':                      'agent',
  'job-resume-instructed':            'agent',
  'job-line-lost':                    'agent',
  'usage-limit-hit':                  'agent',
  'job-stop-requested':               'agent',
  'job-messaged':                     null,
  'job-reopened':                     'agent',
  'intake-titled':                    null,
  'job-ended':                        'agent',
  'decision-opened':                  'needs-user',
  'decision-answered':                'forge',
  'decision-withdrawn':               'forge',
  'incident-opened':                  'forge',
  'incident-handled':                 'forge',
  'incident-defaulted':               'forge',
  'incident-escalated':               'needs-user',
  'incident-noted':                   null,
  'incident-answered':                'forge',
  'merge-started':                    'forge',
  'merge-landed':                     'landed',
  'hatch-applied':                    null,
  'agent-stopped':                    null,
};

const MONITOR_ACTIVITY_ENTRIES = 50;

const RUNNING_SUBAGENT_STATE = 'running';

const QUIET_JOB_INCIDENT_KIND = 'quiet-job';

/** Jobs the monitor contract has no kind for: a ticket document's agent and an effect reading, both of forge 4.2. */
const JOB_KINDS_THE_MONITOR_LEAVES_OUT: readonly JobKind[] = ['document-agent', 'effect-reading'];

/** The subject a record is about: its decision, its job, its ticket, its draft or its incident, the first it names; `null` for the board's own. */
function activityTargetOf(record: LogRecord): BoardTarget | null {
  if ('decisionId' in record) return { subject: 'decision', id: record.decisionId };
  if ('jobId' in record) return { subject: 'job', id: record.jobId };
  if ('ticketId' in record) return { subject: 'ticket', id: record.ticketId };
  if ('draftId' in record) return { subject: 'draft', id: record.draftId };
  if ('incidentId' in record) return { subject: 'incident', id: record.incidentId };
  return null;
}

/** The newest entries a person cares about, oldest first, as the log reads. */
function activityOf(logRecords: readonly LogRecord[]): MonitorActivityEntry[] {
  const entries: MonitorActivityEntry[] = [];
  for (let logPosition = logRecords.length - 1; logPosition >= 0 && entries.length < MONITOR_ACTIVITY_ENTRIES; logPosition -= 1) {
    const record = logRecords[logPosition];
    const category = record === undefined ? null : ACTIVITY_CATEGORY_OF_KIND[record.kind];
    if (record === undefined || category === null) continue;
    entries.push({
      logPosition, at: record.at, category, text: LogUtil.sentenceOf(record), target: activityTargetOf(record)
    });
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
    interruption:        job.state === 'interrupted' && job.interruption !== undefined ? MONITOR_INTERRUPTION_CAUSE_OF_CAUSE[job.interruption] : null,
    target:              { subject: 'job', id: job.id },
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
  const { state, board, hephaestus } = source;
  const notices = NoticeWordingUtil.noticeFactsIn(state.notices);
  const ticketTitleById = new Map((state.page.tickets).map((ticket) => [ticket.id, ticket.title]));
  const { limit, agentsInFlight } = board.concurrency();
  const todayCalendarDate = todayCalendarDateOf(source.now);
  return {
    monitorVersion: SERVED_CONTRACT_VERSIONS.monitor,
    trackerId:      hephaestus.trackerId,
    project:        source.project,
    root:           hephaestus.root,
    hephaestus:     {
      state:             hephaestus.state,
      paused:            state.hephaestus.paused,
      url:               hephaestus.url,
      processId:         hephaestus.processId,
      startedAt:         hephaestus.startedAt,
      generation:        hephaestus.generation,
      codeVersion:       hephaestus.codeVersion,
      codeVersionOnDisk: hephaestus.codeVersionOnDisk,
      installVersion:    hephaestus.installVersion,
    },
    concurrency: {
      limit,
      agentsInFlight,
      machineLimit:                 hephaestus.machine.limit,
      machineAgentsInFlight:        hephaestus.machine.agentsInFlight,
      ticketsWaitingForMachineSlot: hephaestus.machine.ticketsWaitingForMachineSlot,
    },
    ticketCountByStatus: board.ticketCountByStatus(),
    readyTicketIds:      board.readyTicketEntries().map((ready) => ready.id),
    openIncidents:       state.incidents.length,
    attention:           attentionEntriesOf(DraftProgressReading.attentionBoardOf(state, board)),
    jobs:                state.jobs
      .filter((job) => !JOB_KINDS_THE_MONITOR_LEAVES_OUT.includes(job.kind))
      .map((job) => jobOf(job, state.decisions, state.incidents, (ticketId) => ticketTitleById.get(ticketId) ?? null)),
    notices:  notices.map((notice) => ({ kind: notice.kind, text: NoticeWordingUtil.noticeSentenceOf(notice) })),
    warnings: NoticeWordingUtil.warningsOf(notices, NoticeWordingUtil.restartWarningIn(state.hephaestus.restartWarning)),
    today:    todayFiguresOf(state, todayCalendarDate),
    usage:    { resetsAt: state.usage.resetsAt, window: state.usage.window, ...currentUsageWindowOf(state.jobs) },
    activity: activityOf(source.logRecords),
    ...snapshotEntityKeysOf(board),
  };
}

export const MonitorSnapshotAssembly = Object.freeze({ monitorSnapshotOf, activityOf });
