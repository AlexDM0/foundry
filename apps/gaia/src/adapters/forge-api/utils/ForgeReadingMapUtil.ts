/**
 * Maps the forge documents an ingestion has checked to the internal model: an identity to a `ForgeIdentity`, and a monitor snapshot, a
 * board summary or a contract Gaia does not know to a `ForgeReading` at its fidelity (PLAN 6.1, 7.1). What a document does not carry
 * comes from the registry and the identity; a fact no source gives is `null`, never zero. A monitor's
 * `target` names the thing an entry opens, and maps to that subject's place on Gaia's board; an entry with no target maps to none.
 */
import type { BoardTarget, BoardTargetSubject }                                  from 'forge-contracts/BoardReadingDocuments';
import type { BoardSummaryDocument, SummaryJobDocument, SummaryHephaestusState } from 'forge-contracts/BoardSummaryDocument';
import type { IdentityDocument }                                                 from 'forge-contracts/IdentityDocument';
import type {
  MonitorActivityEntryDocument,
  MonitorAttentionEntryDocument,
  MonitorJobDocument,
  MonitorNoticeDocument,
  MonitorSnapshotDocument,
} from 'forge-contracts/MonitorSnapshotDocument';
import type { ActivityEntry } from '../../../shared/@types/ActivityEntry.ts';
import type { AgentRow }      from '../../../shared/@types/AgentRow.ts';
import type { AttentionItem } from '../../../shared/@types/AttentionItem.ts';
import type {
  ForgeCondition,
  ForgeContracts,
  ForgeNotice,
  ForgeReading,
} from '../../../shared/@types/ForgeReading.ts';
import type { BoardRoute }                        from '../../../shared/@types/board/BoardRoute.ts';
import type { BoardTabName }                      from '../../../shared/@types/board/BoardVocabulary.ts';
import { FORGE_NOTICE_KINDS }                     from '../../../shared/constants/ForgeNoticeKinds.ts';
import type { ForgeIdentity, ForgeRegistryFacts } from '../@types/ForgeDocumentReading.ts';

const NO_CONTRACTS: ForgeContracts = {
  summary: null,
  monitor: null,
  control: null,
};

/** The tab each subject opens, and the detail form its id is written in there; `null` writes the id itself, and an incident opens the tab alone. */
const PLACE_OF_TARGET_SUBJECT: Readonly<Record<BoardTargetSubject, { readonly tab: BoardTabName; readonly detailForm: string | null; readonly namesItem: boolean }>> = {
  decision: { tab: 'questions', detailForm: null, namesItem: true },
  ticket:   { tab: 'kanban', detailForm: 'ticket', namesItem: true },
  draft:    { tab: 'kanban', detailForm: 'draft', namesItem: true },
  job:      { tab: 'agents', detailForm: null, namesItem: true },
  incident: { tab: 'assistant', detailForm: null, namesItem: false },
};

const ROUTE_SEGMENT_SEPARATOR = '/';

function boardRouteOf(target: BoardTarget | null): BoardRoute | null {
  if (target === null) return null;
  const { tab, detailForm, namesItem } = PLACE_OF_TARGET_SUBJECT[target.subject];
  if (!namesItem) return { tab, item: null };
  return { tab, item: detailForm === null ? target.id : `${detailForm}${ROUTE_SEGMENT_SEPARATOR}${target.id}` };
}

function identityOf(document: IdentityDocument): ForgeIdentity {
  const { contracts } = document;
  return {
    trackerId:      document.trackerId,
    project:        document.project,
    codeVersion:    document.codeVersion,
    installVersion: document.installVersion,
    processId:      document.processId,
    contracts:      {
      summary: contracts.summary ?? null,
      monitor: contracts.monitor ?? null,
      control: contracts.control ?? null,
    },
  };
}

/** A held launch outranks a pause: it is what User must act on. */
function conditionOf(state: SummaryHephaestusState, paused: boolean): ForgeCondition {
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
    boardRoute:              boardRouteOf(entry.target),
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
    interruption:        job.interruption ?? null,
    boardRoute:          boardRouteOf(job.target),
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
    interruption:        null,
    boardRoute:          null,
  };
}

function noticeOf(notice: MonitorNoticeDocument): ForgeNotice {
  return { kind: notice.kind, text: notice.text };
}

function warningIsANotice(warning: MonitorNoticeDocument): boolean {
  return warning.kind === FORGE_NOTICE_KINDS.assistantDown;
}

function activityEntryOf(entry: MonitorActivityEntryDocument): ActivityEntry {
  return {
    logPosition: entry.logPosition,
    at:          entry.at,
    category:    entry.category,
    text:        entry.text,
    boardRoute:  boardRouteOf(entry.target),
  };
}

/** The contracts the identity names, with the one just read at the number its document carries. */
function contractsWith(identity: ForgeIdentity | null, readContracts: Partial<ForgeContracts>): ForgeContracts {
  return { ...(identity?.contracts ?? NO_CONTRACTS), ...readContracts };
}

/** A forge read in full: everything comes from the snapshot but the contracts, the registry's last command and the stamp of the read. */
function fullReadingOf(snapshot: MonitorSnapshotDocument, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity, readAt: string): ForgeReading {
  const { hephaestus, concurrency, usage } = snapshot;
  return {
    trackerId:           snapshot.trackerId,
    project:             snapshot.project,
    root:                snapshot.root,
    fidelity:            'full',
    condition:           conditionOf(hephaestus.state, hephaestus.paused),
    url:                 hephaestus.url,
    processId:           hephaestus.processId,
    contracts:           contractsWith(identity, { monitor: snapshot.monitorVersion }),
    codeVersion:         hephaestus.codeVersion,
    lastReportedAt:      readAt,
    hephaestusStartedAt: hephaestus.startedAt,
    program:             registryFacts.program,
    lastCommand:         registryFacts.lastCommand,
    lastChangedAt:       registryFacts.lastChangedAt,
    concurrency:         {
      limit:                        concurrency.limit,
      agentsInFlight:               concurrency.agentsInFlight,
      machineLimit:                 concurrency.machineLimit,
      machineAgentsInFlight:        concurrency.machineAgentsInFlight,
      ticketsWaitingForMachineSlot: concurrency.ticketsWaitingForMachineSlot,
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
    versions:         null,
    registryPresence: null,
    presenceReport:   null,
    newestVersions:   null,
  };
}

/**
 * A forge read through its summary: counts and jobs. The open questions are the count of what waits on User that the summary states; no
 * entry is known by name, and no concurrency, notice or activity is known at all.
 */
function countsOnlyReadingOf(summary: BoardSummaryDocument, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity, readAt: string): ForgeReading {
  return {
    trackerId:           registryFacts.trackerId,
    project:             summary.project,
    root:                registryFacts.root,
    fidelity:            'counts-only',
    condition:           conditionOf(summary.hephaestus.state, summary.hephaestus.paused),
    url:                 summary.hephaestus.url ?? registryFacts.hephaestusUrl,
    processId:           identity.processId,
    contracts:           contractsWith(identity, { summary: summary.summaryVersion }),
    codeVersion:         identity.codeVersion,
    lastReportedAt:      readAt,
    hephaestusStartedAt: null,
    program:             registryFacts.program,
    lastCommand:         registryFacts.lastCommand,
    lastChangedAt:       registryFacts.lastChangedAt,
    concurrency:         null,
    readyTicketCount:    summary.readyTicketIds.length,
    openIncidents:       summary.openIncidents,
    attention:           [],
    attentionCount:      summary.openDecisions,
    agents:              summary.jobs.map(agentRowOfSummaryJob),
    notices:             [],
    warnings:            [],
    activity:            [],
    today:               null,
    usage:               {
      resetsAt:              summary.usage.resetsAt,
      window:                summary.usage.window,
      currentWindow:         null,
      currentWindowResetsAt: null,
    },
    versions:         null,
    registryPresence: null,
    presenceReport:   null,
    newestVersions:   null,
  };
}

/**
 * A forge that speaks a contract newer than this Gaia: its place in the registry, what its identity names and the contract numbers, and
 * nothing read from a document. `identity` is `null` when the identity itself is the newer contract.
 */
function newerContractReadingOf(registryFacts: ForgeRegistryFacts, identity: ForgeIdentity | null, contracts: ForgeContracts): ForgeReading {
  return unreadReadingOf(registryFacts, identity, contracts, 'newer-contract');
}

/** A forge whose system version is older than Gaia still talks to: its place in the registry, and nothing asked of its endpoints. */
function olderContractReadingOf(registryFacts: ForgeRegistryFacts): ForgeReading {
  return unreadReadingOf(registryFacts, null, NO_CONTRACTS, 'older-contract');
}

function unreadReadingOf(
  registryFacts: ForgeRegistryFacts,
  identity: ForgeIdentity | null,
  contracts: ForgeContracts,
  fidelity: 'newer-contract' | 'older-contract',
): ForgeReading {
  return {
    trackerId:           registryFacts.trackerId,
    project:             registryFacts.project,
    root:                registryFacts.root,
    fidelity,
    condition:           'unreadable',
    url:                 registryFacts.hephaestusUrl,
    processId:           identity?.processId ?? registryFacts.hephaestusProcessId,
    contracts,
    codeVersion:         identity?.codeVersion ?? null,
    lastReportedAt:      null,
    hephaestusStartedAt: null,
    program:             registryFacts.program,
    lastCommand:         registryFacts.lastCommand,
    lastChangedAt:       registryFacts.lastChangedAt,
    concurrency:         null,
    readyTicketCount:    null,
    openIncidents:       null,
    attention:           [],
    attentionCount:      null,
    agents:              [],
    notices:             [],
    warnings:            [],
    activity:            [],
    today:               null,
    usage:               null,
    versions:            null,
    registryPresence:    null,
    presenceReport:      null,
    newestVersions:      null,
  };
}

export const ForgeReadingMapUtil = {
  identityOf,
  contractsWith,
  fullReadingOf,
  countsOnlyReadingOf,
  newerContractReadingOf,
  olderContractReadingOf,
} as const;
