/**
 * Words the Board's log records as sentences, so entries written by any version of the tool read alike: `status` through `wordedEntryOf`,
 * the page through `identifiedEntryOf`, which also carries every task and ticket id the record concerns, so a detail panel never reads ids
 * out of the sentence.
 */
import { TokenCountUtil }            from '../../lib/token-count/TokenCountUtil.ts';
import type { IncidentDefaultCause } from '../../lib/tracker-model/@types/Incident.ts';
import type { JobStopMode }          from '../../lib/tracker-model/@types/Job.ts';
import type {
  AgentUsage,
  FlintBrainEndedReason,
  LogRecord,
  LogRecordContent,
  LogRecordFieldsOf,
  RetiredDispatcherState
} from '../../lib/tracker-model/@types/LogRecord.ts';
import type { ViewRange }                          from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { IdentifiedLogEntry, WordedLogEntry } from '../../shared/@types/WordedLogEntry.ts';
import type { MovedToStatus }                      from './StatusWordingUtil.ts';
import { StatusWordingUtil }                       from './StatusWordingUtil.ts';
import { TicketPhraseUtil }                        from './TicketPhraseUtil.ts';

type TicketMoveKind = 'ticket-reopened' | 'ticket-started' | 'ticket-finished' | 'ticket-approved' | 'ticket-delivered';

const STATUS_REACHED_BY_MOVE_KIND: Readonly<Record<TicketMoveKind, MovedToStatus>> = {
  'ticket-reopened':  'pending',
  'ticket-started':   'in-progress',
  'ticket-finished':  'in-review',
  'ticket-approved':  'reviewed',
  'ticket-delivered': 'delivered',
};

function retiredDispatcherStateTextOf(state: RetiredDispatcherState, runId: string | null): string {
  return runId === null ? state : `${state} (run ${runId})`;
}

function chartRangeTextOf(view: ViewRange): string {
  if (view.kind === 'auto') return 'automatic';
  const tick = view.tickMinutes === null ? '' : ` (tick ${view.tickMinutes}m)`;
  return `${view.from} → ${view.to}${tick}`;
}

/**
 * Formatted through `src/lib/token-count/TokenCountUtil.ts`, so the log and the chart's token column read in the same units. The cache-read
 * share is named beside the whole input because it is the figure that explains a long session and is invisible in a plain total.
 */
function agentStoppedTextOf(usage: AgentUsage): string {
  const label       = usage.agentLabel === undefined ? '' : ` "${usage.agentLabel}"`;
  const workflowRun = usage.workflowRunId === undefined ? '' : ` of workflow run ${usage.workflowRunId}`;
  return `Agent ${usage.agentId}${label} (${usage.agentType})${workflowRun} stopped: ${usage.apiCallCount} calls, `
    + `end context ${TokenCountUtil.formatTokenCount(usage.endContextTokens)}, `
    + `input ${TokenCountUtil.formatTokenCount(usage.totalInputTokens)} (cache read ${TokenCountUtil.formatTokenCount(usage.cacheReadInputTokens)}), `
    + `output ${TokenCountUtil.formatTokenCount(usage.outputTokens)}`;
}

function pipelineAppliedTextOf(setupId: string, applied: LogRecordFieldsOf<'pipeline-applied'>): string {
  const fieldGroups = [['changed', applied.changedFields], ['new', applied.newFields], ['removed', applied.removedFields]] as const;
  const changes     = fieldGroups.filter(([, fields]) => fields.length > 0).map(([change, fields]) => `${change} ${fields.join(', ')}`);
  return `Pipeline setup ${setupId} applied draft revision ${applied.revision}`
    + `${changes.length === 0 ? ', no field changed' : `: ${changes.join('; ')}`}`
    + `${applied.constitutionCommit === null ? '' : `; constitution committed as ${applied.constitutionCommit}`}`
    + `${applied.resumesBoard ? '; the board resumes' : ''}`;
}

function reviewRecordedTextOf(ticketId: string, review: LogRecordFieldsOf<'review-recorded'>): string {
  const findingWord = review.findings.length === 1 ? 'finding' : 'findings';
  return `Review ${review.round} of #${ticketId} recorded: ${review.verdict}, ${review.findings.length} ${findingWord}, `
    + `${review.totalReworkedCodeLines} lines of code reworked (${review.fixReworkedCodeLines} fixing, ${review.rebaseReworkedCodeLines} rebasing)`;
}

function epicsText(epicKeys: readonly string[]): string {
  if (epicKeys.length === 0) return 'no epic';
  return `${epicKeys.length === 1 ? 'epic' : 'epics'} ${epicKeys.join(', ')}`;
}

function sentenceOf(record: LogRecordContent): string {
  switch (record.kind) {
    case 'note':
      return record.fields.text;
    case 'ticket-filed':
      return `Ticket #${record.ticketId} filed: ${record.fields.title}`;
    case 'ticket-readied':
      return `Ticket #${record.ticketId} ready to build`;
    case 'ticket-submitted-for-review':
      return `Ticket #${record.ticketId} ready for review`;
    case 'merge-queued':
      return `Ticket #${record.ticketId} queued to merge into ${record.fields.target}`;
    case 'merge-acceptance-set':
      return record.fields.state === 'accepted' ? `Ticket #${record.ticketId} accepted to merge` : `Ticket #${record.ticketId} waits for merge approval again`;
    case 'merge-updated':
      return record.fields.outcome === 'merged'
        ? `Ticket #${record.ticketId} updated: ${record.fields.target} merged into its branch`
        : `Ticket #${record.ticketId} not updated: ${record.fields.target} conflicts with its branch, so its reviewer takes it back`;
    case 'ticket-reopened':
    case 'ticket-started':
    case 'ticket-finished':
    case 'ticket-approved':
    case 'ticket-delivered':
      return `Ticket #${record.ticketId} ${StatusWordingUtil.movedPhraseFor(STATUS_REACHED_BY_MOVE_KIND[record.kind])}`;
    case 'ticket-abandoned':
      return `Ticket #${record.ticketId} abandoned: ${record.fields.reason}`;
    case 'ticket-retitled':
      return `Ticket #${record.ticketId} renamed: ${record.fields.from} → ${record.fields.to}`;
    case 'ticket-rereviewed':
      return `Ticket #${record.ticketId} ${StatusWordingUtil.movedPhraseFor('in-review')}, round ${record.fields.round}`;
    case 'ticket-priority-changed':
      return `Ticket #${record.ticketId} priority ${record.fields.from} → ${record.fields.to}`;
    case 'ticket-size-changed':
      return record.fields.from === undefined
        ? `Ticket #${record.ticketId} sized ${record.fields.to}`
        : `Ticket #${record.ticketId} size ${record.fields.from} → ${record.fields.to}`;
    case 'ticket-dependencies-set': {
      const { dependsOn } = record.fields;
      return dependsOn.length === 0
        ? `Ticket #${record.ticketId} waits on no other ticket`
        : `Ticket #${record.ticketId} waits on ${TicketPhraseUtil.ticketReferencesText(dependsOn)}`;
    }
    case 'ticket-introduced-by-set':
      return record.fields.introducedBy === undefined
        ? `Ticket #${record.ticketId} introduced by no named ticket`
        : `Ticket #${record.ticketId} introduced by #${record.fields.introducedBy}`;
    case 'ticket-agents-changed':
      return `Ticket #${record.ticketId} agents ${TicketPhraseUtil.agentPairText(record.fields.from)} → ${TicketPhraseUtil.agentPairText(record.fields.to)}`;
    case 'ticket-held':
      return record.fields.reason === '' ? `Ticket #${record.ticketId} held` : `Ticket #${record.ticketId} held: ${record.fields.reason}`;
    case 'ticket-unheld':
      return `Ticket #${record.ticketId} unheld`;
    case 'ticket-body-changed-after-claim':
      return `Ticket #${record.ticketId} body changed after its claim`;
    case 'ticket-release-marked':
      return `Ticket #${record.ticketId} marked as the release ticket of group ${record.fields.group}`;
    case 'ticket-release-cleared':
      return `Ticket #${record.ticketId} no longer marked as its group's release ticket`;
    case 'ticket-epics-set':
      return `Ticket #${record.ticketId} belongs to ${epicsText(record.fields.epics)}`;
    case 'ticket-network-set':
      return record.fields.domains.length === 0
        ? `Ticket #${record.ticketId} needs no network`
        : `Ticket #${record.ticketId} network: ${record.fields.domains.join(', ')}`;
    case 'entity-assigned':
      return `Ticket #${record.ticketId} belongs to entity ${record.fields.entity}: ${record.fields.reason}`;
    case 'ticket-check-command-restamped':
      return record.fields.command === null
        ? `Ticket #${record.ticketId} restamped with no check command`
        : `Ticket #${record.ticketId} restamped with the check command ${record.fields.command}`;
    case 'epic-added':
      return `Epic ${record.epicKey} added: ${record.fields.title}`;
    case 'epic-edited':
      return `Epic ${record.epicKey} edited: ${record.fields.title}`;
    case 'epic-removed':
      return `Epic ${record.epicKey} removed`;
    case 'draft-opened':
      return `Draft ${record.draftId} opened by ${record.fields.owner}: ${record.fields.title}`;
    case 'draft-claimed':
      return record.fields.takenFrom === undefined
        ? `Draft ${record.draftId} claimed by ${record.fields.owner}`
        : `Draft ${record.draftId} taken over by ${record.fields.owner} from ${record.fields.takenFrom}`;
    case 'draft-released':
      return `Draft ${record.draftId} released by ${record.fields.owner}`;
    case 'draft-closed':
      return `Draft ${record.draftId} closed into ${TicketPhraseUtil.ticketReferencesText(record.fields.ticketIds)}`;
    case 'draft-abandoned':
      return `Draft ${record.draftId} abandoned: ${record.fields.reason}`;
    case 'draft-note-added':
      return `Draft ${record.draftId} noted ${record.fields.noteKind} ${record.fields.noteId}`;
    case 'draft-question-asked':
      return record.fields.underQuestionId === undefined
        ? `Draft ${record.draftId} asked ${record.fields.questionId}`
        : `Draft ${record.draftId} asked ${record.fields.questionId} under ${record.fields.underQuestionId}`;
    case 'draft-question-answered':
      return `Draft ${record.draftId} ${record.fields.questionId} answered: ${record.fields.answer}`;
    case 'draft-item-dropped':
      return `Draft ${record.draftId} dropped ${record.fields.itemId}`;
    case 'pipeline-setup-opened':
      return `Pipeline setup ${record.setupId} opened: ${record.fields.mode}${record.fields.replacesUnreadablePipeline ? ', replacing the unreadable pipeline' : ''}`;
    case 'pipeline-setup-billing-set':
      return `Pipeline setup ${record.setupId} billing set to ${record.fields.mode}`
        + `${record.fields.maxBudgetUsd === undefined ? '' : `, at most $${record.fields.maxBudgetUsd} a launch`}`;
    case 'pipeline-setup-step-moved':
      return `Pipeline setup ${record.setupId} step ${record.fields.step} ${record.fields.state}, now at ${record.fields.currentStep}`
        + `${record.fields.needsRecheck.length === 0 ? '' : `; ${record.fields.needsRecheck.join(', ')} need a recheck`}`;
    case 'pipeline-step-ready-suggested':
      return `Pipeline setup ${record.setupId} agent suggests the ${record.fields.step} step is ready to continue`;
    case 'pipeline-setup-resumed':
      return `Pipeline setup ${record.setupId} resumed on ${record.fields.snapshotCommit}`
        + `${record.fields.changedPaths.length === 0 ? '' : `; changed on main: ${record.fields.changedPaths.join(', ')}`}`;
    case 'pipeline-snapshot-touched':
      return `Pipeline setup ${record.setupId} snapshot touched: ${record.fields.check} ${record.fields.reason}`;
    case 'pipeline-finding-recorded':
      return `Pipeline setup ${record.setupId} recorded finding ${record.fields.findingId} (${record.fields.topic})`;
    case 'pipeline-question-asked':
      return `Pipeline setup ${record.setupId} asked ${record.fields.questionId} at the ${record.fields.step} step`;
    case 'pipeline-question-answered':
      return `Pipeline setup ${record.setupId} ${record.fields.questionId} answered: ${record.fields.answer}`;
    case 'pipeline-constitution-set':
      return `Pipeline setup ${record.setupId} constitution revision ${record.fields.revision} by the ${record.fields.by}`;
    case 'pipeline-draft-edited':
      return `Pipeline setup ${record.setupId} draft revision ${record.fields.revision} by the ${record.fields.by}: `
        + record.fields.editIds.map((editId, index) => `${editId} ${record.fields.fields[index] ?? ''}`.trimEnd()).join(', ');
    case 'pipeline-draft-undone':
      return `Pipeline setup ${record.setupId} undid ${record.fields.editId} (${record.fields.field}), draft revision ${record.fields.revision}`;
    case 'pipeline-draft-discarded':
      return `Pipeline setup ${record.setupId} discarded the draft's changes, draft revision ${record.fields.revision}`;
    case 'pipeline-setup-discarded':
      return `Pipeline setup ${record.setupId} discarded`;
    case 'gate-profile-requested':
      return `Gate profile ${record.profileRunId} queued: ${record.fields.gateName} in the ${record.fields.phase} phase`
        + `${record.fields.setupId === null ? '' : `, from pipeline setup ${record.fields.setupId}`}`;
    case 'gate-profiled':
      return `Gate profile ${record.profileRunId} of ${record.fields.gateName} in the ${record.fields.phase} phase ended ${record.fields.state} `
        + `after ${record.fields.elapsedMilliseconds} ms`;
    case 'gate-profile-stopped':
      return `Gate profile ${record.profileRunId} of ${record.fields.gateName} in the ${record.fields.phase} phase stopped, with no result`;
    case 'pipeline-check-requested':
      return `Pipeline setup ${record.setupId} check of draft revision ${record.fields.revision} queued: ${record.fields.gateNames.join(', ')}`;
    case 'pipeline-apply-requested':
      return `Pipeline setup ${record.setupId} Apply of draft revision ${record.fields.revision} waits for the constitution commit`
        + `${record.fields.resumesBoard ? ', then resumes the board' : ''}`;
    case 'pipeline-apply-held':
      return `Pipeline setup ${record.setupId} Apply held: ${record.fields.reason}`
        + `${record.fields.blockingFiles.length === 0 ? '' : `, blocked by ${record.fields.blockingFiles.join(', ')}`}`;
    case 'pipeline-apply-refused':
      return `Pipeline setup ${record.setupId} Apply refused: ${record.fields.reason}${record.fields.gitFailure === null ? '' : ` (${record.fields.gitFailure})`}`;
    case 'pipeline-apply-cancelled':
      return `Pipeline setup ${record.setupId} Apply of draft revision ${record.fields.revision} cancelled while ${record.fields.state}`;
    case 'pipeline-applied':
      return pipelineAppliedTextOf(record.setupId, record.fields);
    case 'review-bar-started':
      return `Review row #${record.taskId} started: ${record.fields.name}`;
    case 'review-bar-closed':
      return `Closed the review row #${record.taskId}, delivered: ${record.fields.name}`;
    case 'review-recorded':
      return reviewRecordedTextOf(record.ticketId, record.fields);
    case 'chart-range-set':
      return `Chart range: ${chartRangeTextOf(record.fields.view)}`;
    case 'concurrency-limit-set':
      return `Concurrency limit set to ${record.fields.limit}`;
    case 'overseer-set':
      return `Overseer set to ${record.fields.state}`;
    case 'dispatcher-set':
      return `Dispatcher set to ${retiredDispatcherStateTextOf(record.fields.state, record.fields.runId)}`;
    case 'pipeline-prepare-step-set':
      return `Prepare step ${record.fields.name} set to ${record.fields.run}`;
    case 'pipeline-gate-added':
      return `Gate ${record.fields.name} set to ${record.fields.run}`;
    case 'pipeline-gates-none':
      return 'No gates, on purpose';
    case 'pipeline-gate-removed':
      return `Gate ${record.fields.name} removed`;
    case 'pipeline-gates-ordered':
      return `Gates of the ${record.fields.phase} phase ordered: ${record.fields.names.join(', ')}`;
    case 'pipeline-approval-set':
      return `Approval ${record.fields.approval} set ${record.fields.state}`;
    case 'pipeline-reach-set':
      return record.fields.paths.length === 0 ? 'Reach cleared' : `Reach set to ${record.fields.paths.join(' ')}`;
    case 'branch-namespace-set':
      return `Branch namespace set to ${record.fields.namespace}`;
    case 'check-command-set':
      return record.fields.command === null ? 'Check command cleared' : `Check command set to ${record.fields.command}`;
    case 'install-command-set':
      return `Install command set to ${record.fields.command}`;
    case 'checks-definition-files-set':
      return record.fields.patterns.length === 0
        ? 'Checks definition files cleared'
        : `Checks definition files set to ${record.fields.patterns.join(' ')}`;
    case 'gate-key-command-set':
      return record.fields.command === null ? 'Gate key command cleared' : `Gate key command set to ${record.fields.command}`;
    case 'gate-cache-paths-set':
      return record.fields.paths.length === 0 ? 'Gate cache paths cleared' : `Gate cache paths set to ${record.fields.paths.join(' ')}`;
    case 'gate-ran':
      return record.fields.cached ? `Gate on tree ${record.fields.tree} passed, from the cache` : `Gate on tree ${record.fields.tree} ${record.fields.outcome}`;
    case 'tracker-cleared':
      return 'Tracker cleared';
    case 'agent-stopped':
      return agentStoppedTextOf(record.fields);
    case 'flint-brain-ended':
      return flintBrainEndedTextOf(record.fields);
    case 'overseer-started':
      return `Overseer started on code ${record.fields.codeVersion}, install version ${record.fields.installVersion}`;
    case 'overseer-stopped':
      return record.fields.reason === 'baton-passed' ? 'Overseer handed the board over to its successor' : 'Overseer stopped';
    case 'baton-pass-failed':
      return `Overseer Baton pass to code ${record.fields.successorCodeVersion} failed at ${record.fields.step}: ${record.fields.error}; the old Overseer keeps driving`;
    case 'job-launched':
      return jobLaunchedTextOf(record.jobId, record.fields);
    case 'job-interrupted':
      return `Job ${record.jobId} interrupted (${record.fields.cause}) in Watcher instance ${record.fields.watcherInstance}`;
    case 'job-resumed':
      return `Job ${record.jobId} resumed in Watcher instance ${record.fields.watcherInstance} after ${record.fields.cause}`;
    case 'usage-limit-hit':
      return `Job ${record.jobId} hit the ${record.fields.window} usage limit; nothing launches or resumes before ${record.fields.resetsAt}`;
    case 'job-ended':
      return jobEndedTextOf(record.jobId, record.fields);
    case 'job-stop-requested':
      return `User asked job ${record.jobId} to ${JOB_STOP_MODE_PHRASES[record.fields.mode]}`;
    case 'job-messaged':
      return `Message for job ${record.jobId}: ${record.fields.text}`;
    case 'job-reopened': {
      const sender = record.fields.byOverseer === true ? 'the Overseer\'s' : 'User\'s';
      return `Job ${record.jobId} reopened in Watcher instance ${record.fields.watcherInstance} for ${sender} message: ${record.fields.text}`;
    }
    case 'intake-titled':
      return `Intake of job ${record.jobId} titled: ${record.fields.title}`;
    case 'worktree-repaired':
      return `Worktree of #${record.ticketId} repaired: ${record.fields.step}${record.fields.patchPath === null ? '' : `, its changes saved to ${record.fields.patchPath}`}`;
    case 'decision-opened':
      return `Decision ${record.decisionId} opened: ${record.fields.kind}${ticketsSuffixOf(record.fields.ticketIds)}`;
    case 'decision-answered':
      return decisionAnsweredTextOf(record.decisionId, record.fields.answer);
    case 'decision-withdrawn':
      return `Decision ${record.decisionId} withdrawn: ${record.fields.reason}`;
    case 'incident-opened':
      return `Incident ${record.incidentId} opened: ${record.fields.kind}${ticketsSuffixOf(record.fields.ticketIds)}`;
    case 'incident-handled':
      return `Incident ${record.incidentId} handled by ${record.fields.move}`;
    case 'incident-defaulted':
      return `Incident ${record.incidentId} took its default, ${record.fields.move}, ${INCIDENT_DEFAULT_CAUSE_TEXT[record.fields.cause]}`;
    case 'incident-escalated':
      return `Incident ${record.incidentId} escalated to the user as decision ${record.fields.decisionId}`;
    case 'incident-noted':
      return `Note on incident ${record.incidentId}: ${record.fields.text}`;
    case 'incident-answered':
      return `Incident ${record.incidentId} answered: ${Object.values(record.fields.answer).join('; ')}`;
    case 'merge-started':
      return mergeStartedTextOf(record.jobId, record.fields);
    case 'merge-landed':
      return `Job ${record.jobId} ${record.fields.kind === 'landed' ? 'landed' : 'integrated'} ${record.fields.commit} on ${record.fields.target}`;
    case 'hatch-applied':
      return `Job ${record.jobId}'s relayed ${record.fields.commandKind} ${record.fields.requestId} answered ${record.fields.outcome}`;
  }
}

const JOB_STOP_MODE_PHRASES: Readonly<Record<JobStopMode, string>> = {
  'stop':      'stop',
  'wind-down': 'wind down',
  'fresh':     'make way for a fresh agent',
};

const INCIDENT_DEFAULT_CAUSE_TEXT: Readonly<Record<IncidentDefaultCause, string>> = {
  'turn-closed':  'when its delivery turn closed',
  'turn-budget':  'when its delivery turn reached its call budget',
  'no-assistant': 'while no Assistant could come up',
};

const FLINT_BRAIN_ENDING_PHRASES: Readonly<Record<FlintBrainEndedReason, string>> = {
  'time':        'stopped after its whole time',
  'stopped':     'was stopped',
  'usage-limit': 'stopped at the usage limit',
  'failed':      'failed',
};

/** Names no client: who started the run is the record's fact, not the sentence's. */
function flintBrainEndedTextOf(run: LogRecordFieldsOf<'flint-brain-ended'>): string {
  const calls = `${run.calls} model call${run.calls === 1 ? '' : 's'}`;
  return `Flint's brain ${FLINT_BRAIN_ENDING_PHRASES[run.endedReason]}, after ${calls} and ${TokenCountUtil.formatTokenCount(run.tokens)} tokens`;
}

function ticketsSuffixOf(ticketIds: readonly string[]): string {
  return ticketIds.length === 0 ? '' : ` for ${TicketPhraseUtil.ticketReferencesText(ticketIds)}`;
}

/** Answers are quoted as given, after the question they answer, in the order the decision asked them. */
function decisionAnsweredTextOf(decisionId: string, answer: Readonly<Record<string, string>>): string {
  const answers = Object.entries(answer).map(([question, text]) => `${JSON.stringify(question)}: ${JSON.stringify(text)}`);
  return `Decision ${decisionId} answered: ${answers.join('; ')}`;
}

function mergeStartedTextOf(jobId: string, started: LogRecordFieldsOf<'merge-started'>): string {
  const conflicts = started.predictedConflictFiles.length === 0 ? 'predicted clean' : `predicted to conflict in ${started.predictedConflictFiles.join(', ')}`;
  return `Job ${jobId} took the ${started.target} Airlock at ${started.target} ${started.targetTip}, branch ${started.branchTip}, ${conflicts}`;
}

function jobLaunchedTextOf(jobId: string, launch: LogRecordFieldsOf<'job-launched'>): string {
  const role    = launch.role === null ? '' : ` (${launch.role})`;
  const tickets = launch.ticketIds.length === 0 ? '' : ` for ${TicketPhraseUtil.ticketReferencesText(launch.ticketIds)}`;
  const target  = launch.target === null ? '' : ` onto ${launch.target}`;
  const parent  = launch.parentJobId === null ? '' : ` under job ${launch.parentJobId}`;
  const request = launch.intakeText === undefined ? '' : ` for User's request: ${launch.intakeText}`;
  return `Job ${jobId} launched: ${launch.kind}${role}${tickets}${target}${parent}, attempt ${launch.attempt}${request}`;
}

function jobEndedTextOf(jobId: string, ending: LogRecordFieldsOf<'job-ended'>): string {
  const cause  = ending.cause === undefined ? '' : ` (${ending.cause})`;
  const commit = ending.commit === undefined ? '' : ` at ${ending.commit}`;
  const denied = ending.deniedPermissions.length === 0 ? '' : `; denied ${ending.deniedPermissions.join(', ')}`;
  return `Job ${jobId} ended ${ending.outcome}${cause}${commit}${denied}`;
}

function wordedEntryOf(record: LogRecord): WordedLogEntry {
  return { at: record.at, text: sentenceOf(record) };
}

function taskIdsConcernedBy(record: LogRecordContent): number[] {
  return 'taskId' in record ? [record.taskId] : [];
}

function ticketIdsConcernedBy(record: LogRecordContent): string[] {
  if (record.kind === 'ticket-dependencies-set') return [...new Set([record.ticketId, ...record.fields.dependsOn])];
  if (record.kind === 'ticket-introduced-by-set' && record.fields.introducedBy !== undefined) return [record.ticketId, record.fields.introducedBy];
  if (record.kind === 'draft-closed' || record.kind === 'job-launched' || record.kind === 'decision-opened' || record.kind === 'incident-opened') {
    return [...record.fields.ticketIds];
  }
  return 'ticketId' in record ? [record.ticketId] : [];
}

function identifiedEntryOf(record: LogRecord): IdentifiedLogEntry {
  if (record.kind === 'note') {
    return wordedEntryOf(record);
  }
  return {
    ...wordedEntryOf(record),
    taskIds:   taskIdsConcernedBy(record),
    ticketIds: ticketIdsConcernedBy(record),
  };
}

export const LogUtil = {
  identifiedEntryOf,
  sentenceOf,
  wordedEntryOf,
} as const;
