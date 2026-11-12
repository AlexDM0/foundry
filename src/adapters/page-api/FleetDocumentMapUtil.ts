/**
 * Maps the internal `FleetSnapshot` out to the page contract. Every key is named one by one, so a key the internal model gains reaches the
 * page only when the contract names it.
 */
import type {
  FleetDocument,
  FleetDocumentActivityEntry,
  FleetDocumentAgentRow,
  FleetDocumentAttentionItem,
  FleetDocumentForge,
  FleetDocumentGaia,
  FleetDocumentNotice,
  FleetDocumentSettings,
} from '../../../page/@types/FleetDocument.ts';
import type { ActivityEntry }             from '../../shared/@types/ActivityEntry.ts';
import type { AgentRow }                  from '../../shared/@types/AgentRow.ts';
import type { AttentionItem }             from '../../shared/@types/AttentionItem.ts';
import type { FleetSnapshot, GaiaFacts }  from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeNotice, ForgeReading } from '../../shared/@types/ForgeReading.ts';
import type { GaiaSettings }              from '../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }              from '../../shared/constants/ContractVersions.ts';

function attentionItemOut(item: AttentionItem): FleetDocumentAttentionItem {
  return {
    key:                     item.key,
    kind:                    item.kind,
    idText:                  item.idText,
    ticketIds:               [...item.ticketIds],
    subject:                 item.subject,
    jobId:                   item.jobId,
    askedBy:                 item.askedBy,
    decisionKind:            item.decisionKind,
    escalatedFromIncidentId: item.escalatedFromIncidentId,
    metaText:                item.metaText,
    stamp:                   item.stamp,
    stampWord:               item.stampWord,
    actionLabel:             item.actionLabel,
    route:                   item.route,
  };
}

function agentRowOut(row: AgentRow): FleetDocumentAgentRow {
  return {
    jobId:               row.jobId,
    kind:                row.kind,
    role:                row.role,
    state:               row.state,
    ticketIds:           [...row.ticketIds],
    tokens:              row.tokens,
    ticketTitle:         row.ticketTitle,
    attempt:             row.attempt,
    startedAt:           row.startedAt,
    calls:               row.calls,
    callBudget:          row.callBudget,
    toolCalls:           row.toolCalls,
    lastToolCall:        row.lastToolCall,
    runningSubagents:    row.runningSubagents,
    silentSweeps:        row.silentSweeps,
    quiet:               row.quiet,
    turn:                row.turn,
    messagesWaiting:     row.messagesWaiting,
    lastLine:            row.lastLine,
    waitingOnDecisionId: row.waitingOnDecisionId,
    route:               row.route,
  };
}

function activityEntryOut(entry: ActivityEntry): FleetDocumentActivityEntry {
  return {
    logPosition: entry.logPosition,
    at:          entry.at,
    category:    entry.category,
    text:        entry.text,
    route:       entry.route,
  };
}

function noticeOut(notice: ForgeNotice): FleetDocumentNotice {
  return { kind: notice.kind, text: notice.text };
}

function forgeOut(reading: ForgeReading): FleetDocumentForge {
  const {
    concurrency, contracts, today, usage
  } = reading;
  return {
    trackerId: reading.trackerId,
    project:   reading.project,
    root:      reading.root,
    fidelity:  reading.fidelity,
    condition: reading.condition,
    url:       reading.url,
    processId: reading.processId,
    contracts: {
      summary: contracts.summary,
      monitor: contracts.monitor,
      control: contracts.control,
      embed:   contracts.embed,
    },
    codeVersion:       reading.codeVersion,
    lastReportedAt:    reading.lastReportedAt,
    overseerStartedAt: reading.overseerStartedAt,
    lastCommand:       reading.lastCommand,
    lastChangedAt:     reading.lastChangedAt,
    concurrency:       concurrency === null ? null : {
      limit:                        concurrency.limit,
      agentsInFlight:               concurrency.agentsInFlight,
      machineLimit:                 concurrency.machineLimit,
      machineAgentsInFlight:        concurrency.machineAgentsInFlight,
      ticketsWaitingForMachineSlot: concurrency.ticketsWaitingForMachineSlot,
    },
    readyTicketCount: reading.readyTicketCount,
    openIncidents:    reading.openIncidents,
    attention:        reading.attention.map(attentionItemOut),
    attentionCount:   reading.attentionCount,
    agents:           reading.agents.map(agentRowOut),
    notices:          reading.notices.map(noticeOut),
    warnings:         reading.warnings.map(noticeOut),
    activity:         reading.activity.map(activityEntryOut),
    today:            today === null ? null : { deliveredTickets: today.deliveredTickets, tokens: today.tokens },
    usage:            usage === null ? null : { resetsAt: usage.resetsAt, window: usage.window },
  };
}

function settingsOut(settings: GaiaSettings): FleetDocumentSettings {
  const { enabled, kinds } = settings.notifications;
  return {
    theme:            settings.theme,
    hiddenTrackerIds: [...settings.hiddenTrackerIds],
    forgeProgramPath: settings.forgeProgramPath,
    notifications:    {
      enabled,
      kinds: {
        'escalated-questions':            kinds['escalated-questions'],
        'questions':                      kinds['questions'],
        'reviews-and-merge-accepts':      kinds['reviews-and-merge-accepts'],
        'forge-holds-or-stops-answering': kinds['forge-holds-or-stops-answering'],
        'quiet-agents':                   kinds['quiet-agents'],
        'machine-at-limit':               kinds['machine-at-limit'],
        'draft-tickets':                  kinds['draft-tickets'],
      },
    },
    startForgesAtLogin: settings.startForgesAtLogin,
  };
}

function gaiaOut(gaia: GaiaFacts): FleetDocumentGaia {
  const { knownContracts } = gaia;
  return {
    gaiaVersion:       gaia.gaiaVersion,
    address:           gaia.address,
    homeFolder:        gaia.homeFolder,
    registryPath:      gaia.registryPath,
    forgeProgramInUse: gaia.forgeProgramInUse,
    settingsFile:      gaia.settingsFile,
    knownContracts:    {
      summary: knownContracts.summary,
      monitor: knownContracts.monitor,
      control: knownContracts.control,
      embed:   knownContracts.embed,
    },
  };
}

export const FleetDocumentMapUtil = {
  fleetDocumentOf(snapshot: FleetSnapshot): FleetDocument {
    const { figures, machine } = snapshot;
    return {
      fleetVersion: CONTRACT_VERSIONS.gaiaFleetDocument,
      forges:       snapshot.forges.map(forgeOut),
      attention:    snapshot.attention.map((item) => ({ ...attentionItemOut(item), trackerId: item.trackerId })),
      needsALook:   snapshot.needsALook.map((look) => ({ trackerId: look.trackerId, kind: look.kind })),
      agents:       snapshot.agents.map((row) => ({ ...agentRowOut(row), trackerId: row.trackerId })),
      activity:     snapshot.activity.map((entry) => ({ ...activityEntryOut(entry), trackerId: entry.trackerId })),
      machine:      {
        cpuCount:                     machine.cpuCount,
        agentsAskedForByForgeLimits:  machine.agentsAskedForByForgeLimits,
        ticketsWaitingForMachineSlot: machine.ticketsWaitingForMachineSlot,
      },
      figures: {
        waitingOnUser:  figures.waitingOnUser,
        agentsInFlight: figures.agentsInFlight,
        machineLimit:   figures.machineLimit,
        readyTickets:   figures.readyTickets,
        deliveredToday: figures.deliveredToday,
        tokensToday:    figures.tokensToday,
        openIncidents:  figures.openIncidents,
        incompleteFor:  [...figures.incompleteFor],
      },
      settings: settingsOut(snapshot.settings),
      gaia:     gaiaOut(snapshot.gaia),
    };
  },
} as const;
