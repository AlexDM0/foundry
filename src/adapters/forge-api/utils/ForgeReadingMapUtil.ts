/**
 * Maps the forge documents an ingestion has checked to the internal model: an identity to a `ForgeIdentity`, and a monitor snapshot, a
 * board summary or a contract Gaia does not know to a `ForgeReading` at its fidelity (PLAN 6.1, 7.1). What a document does not carry
 * comes from the registry and the identity; a fact no source gives is `null`, never zero.
 */
import type { ActivityEntry } from '../../../shared/@types/ActivityEntry.ts';
import type { AgentRow }      from '../../../shared/@types/AgentRow.ts';
import type { AttentionItem } from '../../../shared/@types/AttentionItem.ts';
import type {
  ForgeCondition,
  ForgeContracts,
  ForgeNotice,
  ForgeReading,
} from '../../../shared/@types/ForgeReading.ts';
import type { BoardSummaryDocument, SummaryJobDocument, SummaryOverseerState } from '../@types/BoardSummaryDocument.ts';
import type { ForgeIdentity, ForgeRegistryFacts }                              from '../@types/ForgeDocumentReading.ts';
import type { IdentityDocument }                                               from '../@types/IdentityDocument.ts';
import type {
  MonitorActivityEntryDocument,
  MonitorAttentionEntryDocument,
  MonitorJobDocument,
  MonitorNoticeDocument,
  MonitorSnapshotDocument,
} from '../@types/MonitorSnapshotDocument.ts';

/** The forge's warning that no Assistant can come up: Gaia shows it as a notice, in its own words, and not as a look. */
export const ASSISTANT_DOWN_KIND = 'assistant-down';

const NO_CONTRACTS: ForgeContracts = {
  summary: null,
  monitor: null,
  control: null,
  embed:   null,
};

function identityOf(document: IdentityDocument): ForgeIdentity {
  const { contracts } = document;
  return {
    trackerId:      document.trackerId,
    project:        document.project,
    codeVersion:    document.codeVersion,
    installVersion: document.installVersion,
    processId:      document.processId,
    contracts:      contracts === undefined ? null : {
      summary: contracts.summary ?? null,
      monitor: contracts.monitor ?? null,
      control: contracts.control ?? null,
      embed:   contracts.embed ?? null,
    },
  };
}

/** A held launch outranks a pause: it is what User must act on. */
function conditionOf(state: SummaryOverseerState, paused: boolean): ForgeCondition {
  switch (state) {
    case 'held-by-install-change':
      return 'held';
    case 'passing-baton':
      return 'passing-baton';
    case 'down':
      return 'dormant';
    case 'serving':
      return paused ? 'paused' : 'live';
  }
}

function attentionItemOf(entry: MonitorAttentionEntryDocument): AttentionItem {
  return {
    key:                     entry.key,
    kind:                    entry.kind,
    idText:                  entry.idText,
    ticketIds:               [...entry.ticketIds],
    subject:                 entry.subject,
    jobId:                   entry.jobId,
    askedBy:                 entry.askedBy,
    decisionKind:            entry.decisionKind,
    escalatedFromIncidentId: entry.escalatedFromIncidentId,
    metaText:                entry.metaText,
    stamp:                   entry.stamp,
    stampWord:               entry.stampWord,
    actionLabel:             entry.actionLabel,
    route:                   entry.route,
  };
}

function agentRowOfMonitorJob(job: MonitorJobDocument): AgentRow {
  return {
    jobId:               job.id,
    kind:                job.kind,
    role:                job.role,
    state:               job.state,
    ticketIds:           [...job.ticketIds],
    tokens:              job.tokens,
    ticketTitle:         job.ticketTitle,
    attempt:             job.attempt,
    // The forge sends an empty stamp for a job whose launch stamp it lost; the job's running time is then unknown.
    startedAt:           job.startedAt === '' ? null : job.startedAt,
    calls:               job.calls,
    callBudget:          job.callBudget,
    toolCalls:           job.toolCalls,
    lastToolCall:        job.lastToolCall,
    runningSubagents:    job.runningSubagents,
    silentSweeps:        job.silentSweeps,
    quiet:               job.quiet,
    turn:                job.turn,
    messagesWaiting:     job.messagesWaiting,
    lastLine:            job.lastLine,
    waitingOnDecisionId: job.waitingOnDecisionId,
    route:               job.route,
  };
}

/** A summary's job reports its id, kind, role, tickets, state and tokens; every other fact is unknown, so `null`. */
function agentRowOfSummaryJob(job: SummaryJobDocument): AgentRow {
  return {
    jobId:               job.id,
    kind:                job.kind,
    role:                job.role,
    state:               job.state,
    ticketIds:           [...job.ticketIds],
    tokens:              job.tokens,
    ticketTitle:         null,
    attempt:             null,
    startedAt:           null,
    calls:               null,
    callBudget:          null,
    toolCalls:           null,
    lastToolCall:        null,
    runningSubagents:    null,
    silentSweeps:        null,
    quiet:               null,
    turn:                null,
    messagesWaiting:     null,
    lastLine:            null,
    waitingOnDecisionId: null,
    route:               null,
  };
}

function noticeOf(notice: MonitorNoticeDocument): ForgeNotice {
  return { kind: notice.kind, text: notice.text };
}

function warningIsANotice(warning: MonitorNoticeDocument): boolean {
  return warning.kind === ASSISTANT_DOWN_KIND;
}

function activityEntryOf(entry: MonitorActivityEntryDocument): ActivityEntry {
  return {
    logPosition: entry.logPosition,
    at:          entry.at,
    category:    entry.category,
    text:        entry.text,
    route:       entry.route,
  };
}

/** The contracts the identity names, with the one just read at the number its document carries. */
function contractsWith(identity: ForgeIdentity | null, readContracts: Partial<ForgeContracts>): ForgeContracts {
  return { ...(identity?.contracts ?? NO_CONTRACTS), ...readContracts };
}

/** A forge read in full: everything comes from the snapshot but the contracts, the registry's last command and the stamp of the read. */
function fullReadingOf(snapshot: MonitorSnapshotDocument, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity, readAt: string): ForgeReading {
  const { overseer, concurrency, usage } = snapshot;
  return {
    trackerId:         snapshot.trackerId,
    project:           snapshot.project,
    root:              snapshot.root,
    fidelity:          'full',
    condition:         conditionOf(overseer.state, overseer.paused),
    url:               overseer.url,
    processId:         overseer.processId,
    contracts:         contractsWith(identity, { monitor: snapshot.monitorVersion }),
    codeVersion:       overseer.codeVersion,
    lastReportedAt:    readAt,
    overseerStartedAt: overseer.startedAt,
    lastCommand:       registryFacts.lastCommand,
    lastChangedAt:     registryFacts.lastChangedAt,
    concurrency:       {
      limit:                        concurrency.limit,
      agentsInFlight:               concurrency.agentsInFlight,
      machineLimit:                 concurrency.machineLimit ?? null,
      machineAgentsInFlight:        concurrency.machineAgentsInFlight ?? null,
      ticketsWaitingForMachineSlot: concurrency.ticketsWaitingForMachineSlot ?? null,
    },
    readyTicketCount: snapshot.readyTicketIds.length,
    openIncidents:    snapshot.openIncidents,
    attention:        snapshot.attention.map(attentionItemOf),
    attentionCount:   null,
    agents:           snapshot.jobs.map(agentRowOfMonitorJob),
    notices:          [...snapshot.notices, ...snapshot.warnings.filter(warningIsANotice)].map(noticeOf),
    warnings:         snapshot.warnings.filter((warning) => !warningIsANotice(warning)).map(noticeOf),
    activity:         snapshot.activity.map(activityEntryOf),
    today:            { deliveredTickets: snapshot.today.deliveredTickets, tokens: snapshot.today.tokens },
    usage:            {
      resetsAt:              usage.resetsAt,
      window:                usage.window,
      currentWindow:         usage.currentWindow,
      currentWindowResetsAt: usage.currentWindowResetsAt,
    },
  };
}

/**
 * A forge read through its summary: counts and jobs. The open questions are the count of what waits on User that the summary states; no
 * entry is known by name, and no concurrency, notice or activity is known at all.
 */
function countsOnlyReadingOf(summary: BoardSummaryDocument, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity, readAt: string): ForgeReading {
  return {
    trackerId:         registryFacts.trackerId,
    project:           summary.project,
    root:              registryFacts.root,
    fidelity:          'counts-only',
    condition:         conditionOf(summary.overseer.state, summary.overseer.paused),
    url:               summary.overseer.url ?? registryFacts.overseerUrl,
    processId:         identity.processId,
    contracts:         contractsWith(identity, { summary: summary.summaryVersion }),
    codeVersion:       identity.codeVersion,
    lastReportedAt:    readAt,
    overseerStartedAt: null,
    lastCommand:       registryFacts.lastCommand,
    lastChangedAt:     registryFacts.lastChangedAt,
    concurrency:       null,
    readyTicketCount:  summary.readyTicketIds.length,
    openIncidents:     summary.openIncidents,
    attention:         [],
    attentionCount:    summary.openDecisions,
    agents:            summary.jobs.map(agentRowOfSummaryJob),
    notices:           [],
    warnings:          [],
    activity:          [],
    today:             null,
    usage:             {
      resetsAt:              summary.usage.resetsAt,
      window:                summary.usage.window,
      currentWindow:         null,
      currentWindowResetsAt: null,
    },
  };
}

/**
 * A forge that speaks a contract newer than this Gaia: its place in the registry, what its identity names and the contract numbers, and
 * nothing read from a document. `identity` is `null` when the identity itself is the newer contract.
 */
function newerContractReadingOf(registryFacts: ForgeRegistryFacts, identity: ForgeIdentity | null, contracts: ForgeContracts): ForgeReading {
  return {
    trackerId:         registryFacts.trackerId,
    project:           registryFacts.project,
    root:              registryFacts.root,
    fidelity:          'newer-contract',
    condition:         'unreadable',
    url:               registryFacts.overseerUrl,
    processId:         identity?.processId ?? registryFacts.overseerProcessId,
    contracts,
    codeVersion:       identity?.codeVersion ?? null,
    lastReportedAt:    null,
    overseerStartedAt: null,
    lastCommand:       registryFacts.lastCommand,
    lastChangedAt:     registryFacts.lastChangedAt,
    concurrency:       null,
    readyTicketCount:  null,
    openIncidents:     null,
    attention:         [],
    attentionCount:    null,
    agents:            [],
    notices:           [],
    warnings:          [],
    activity:          [],
    today:             null,
    usage:             null,
  };
}

export const ForgeReadingMapUtil = {
  identityOf,
  contractsWith,
  fullReadingOf,
  countsOnlyReadingOf,
  newerContractReadingOf,
} as const;
