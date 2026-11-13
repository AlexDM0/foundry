/**
 * The forge's `MonitorSnapshot` at `monitorVersion: 1` (F2), from `GET /api/monitor` and each `monitor` event (F3): the keys Gaia reads,
 * after their check. Keys Gaia does not read, such as `ticketCountByStatus` and the Overseer's `generation`, are passed over.
 */
import type { ActivityCategory }                                        from '../../../shared/@types/ActivityEntry.ts';
import type { JobTurn }                                                 from '../../../shared/@types/AgentRow.ts';
import type { AttentionActionLabel, AttentionKind, AttentionStampWord } from '../../../shared/@types/AttentionItem.ts';

export type MonitorOverseerState = 'serving' | 'held-by-install-change' | 'passing-baton';

export interface MonitorOverseerDocument {
  readonly state:       MonitorOverseerState;
  readonly paused:      boolean;
  readonly url:         string;
  readonly processId:   number;
  readonly startedAt:   string;
  readonly codeVersion: string;
}

/** The machine-wide keys come with F6; a forge that does not enforce a machine limit yet leaves them out. */
export interface MonitorConcurrencyDocument {
  readonly limit:                         number;
  readonly agentsInFlight:                number;
  readonly machineLimit?:                 number | null;
  readonly machineAgentsInFlight?:        number | null;
  readonly ticketsWaitingForMachineSlot?: number | null;
}

export interface MonitorAttentionEntryDocument {
  readonly key:                     string;
  readonly kind:                    AttentionKind;
  readonly idText:                  string;
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  readonly metaText:                string | null;
  readonly stamp:                   string;
  readonly stampWord:               AttentionStampWord;
  readonly actionLabel:             AttentionActionLabel;
  readonly route:                   string;
}

export interface MonitorJobDocument {
  readonly id:                  string;
  readonly kind:                string;
  readonly role:                string | null;
  readonly state:               string;
  readonly ticketIds:           readonly string[];
  readonly ticketTitle:         string | null;
  readonly attempt:             number;
  /** `''` when the forge lost the job's launch stamp. */
  readonly startedAt:           string;
  readonly calls:               number;
  readonly callBudget:          number | null;
  readonly tokens:              number;
  readonly toolCalls:           number;
  readonly lastToolCall:        string | null;
  readonly runningSubagents:    number;
  readonly silentSweeps:        number;
  readonly quiet:               boolean;
  readonly turn:                JobTurn | null;
  readonly messagesWaiting:     number;
  readonly lastLine:            string | null;
  readonly waitingOnDecisionId: string | null;
  readonly route:               string;
}

/** A notice or a warning: the forge's kind and its own sentence. */
export interface MonitorNoticeDocument {
  readonly kind: string;
  readonly text: string;
}

export interface MonitorActivityEntryDocument {
  readonly logPosition: number;
  readonly at:          string;
  readonly category:    ActivityCategory;
  readonly text:        string;
  readonly route:       string | null;
}

export interface MonitorTodayDocument {
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

export interface MonitorUsageDocument {
  readonly resetsAt: string | null;
  readonly window:   string | null;
}

export interface MonitorSnapshotDocument {
  readonly monitorVersion: number;
  readonly trackerId:      string;
  readonly project:        string;
  readonly root:           string;
  readonly overseer:       MonitorOverseerDocument;
  readonly concurrency:    MonitorConcurrencyDocument;
  readonly readyTicketIds: readonly string[];
  readonly openIncidents:  number;
  readonly attention:      readonly MonitorAttentionEntryDocument[];
  readonly jobs:           readonly MonitorJobDocument[];
  readonly notices:        readonly MonitorNoticeDocument[];
  /** The header's warnings, each the forge's sentence alone: monitor contract 1 gives a warning no kind. */
  readonly warnings:       readonly string[];
  readonly today:          MonitorTodayDocument;
  readonly usage:          MonitorUsageDocument;
  readonly activity:       readonly MonitorActivityEntryDocument[];
}
