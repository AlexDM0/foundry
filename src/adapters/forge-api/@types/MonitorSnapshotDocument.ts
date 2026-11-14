/**
 * The forge's `MonitorSnapshot` (F2), from `GET /api/monitor` and each `monitor` event (F3): the keys Gaia reads, after their check, at
 * `monitorVersion: 2`, and the keys of `monitorVersion: 1` that differ, which the ingestion migrates. Keys Gaia does not read, such as
 * `ticketCountByStatus` and the Overseer's `generation`, are passed over.
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

/** A notice or, from monitor contract 2, a warning: the forge's kind and its own sentence. */
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

/** The usage limit hit, both `null` when no limit was hit: the board summary's usage and monitor contract 1's. */
export interface UsageLimitDocument {
  readonly resetsAt: string | null;
  readonly window:   string | null;
}

/** Monitor contract 2 adds the newest usage window a session of the board reported, under the limit or not; both `null` when none did. */
export interface MonitorUsageDocument extends UsageLimitDocument {
  readonly currentWindow:         string | null;
  readonly currentWindowResetsAt: string | null;
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
  /** The header's warnings: `baton-pass-failed` and `assistant-down` in monitor contract 2. */
  readonly warnings:       readonly MonitorNoticeDocument[];
  readonly today:          MonitorTodayDocument;
  readonly usage:          MonitorUsageDocument;
  readonly activity:       readonly MonitorActivityEntryDocument[];
}

/** Monitor contract 1 sends each header warning as the forge's sentence alone, and a usage without the current window. */
export interface MonitorSnapshotDocumentOfVersionOne extends Omit<MonitorSnapshotDocument, 'warnings' | 'usage'> {
  readonly warnings: readonly string[];
  readonly usage:    UsageLimitDocument;
}
