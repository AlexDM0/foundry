/**
 * The forge's `MonitorSnapshot` (F2), from `GET /api/monitor` and each `monitor` event (F3): the keys a reader checks at `monitorVersion: 3`;
 * and the stream's handshake and event, which carry the forge's system version.
 * Keys no reader checks, such as `ticketCountByStatus` and the Overseer's `generation`, are left out. Every string union is the wire's own
 * spelling.
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import type { MONITOR_INTERRUPTION_CAUSES } from '../constants/MonitorInterruptionCauses.ts';
import type { BoardTarget }                 from './BoardReadingDocuments.ts';


export type MonitorAttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

export type MonitorAttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type MonitorAttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

export type MonitorJobTurn = 'between-turns' | 'mid-turn';

export type MonitorInterruptionCause = typeof MONITOR_INTERRUPTION_CAUSES[number];

export type MonitorActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

export type MonitorOverseerState = 'serving' | 'held-by-install-change' | 'passing-baton';

export interface MonitorOverseerDocument {
  readonly state:       MonitorOverseerState;
  readonly paused:      boolean;
  readonly url:         string;
  readonly processId:   number;
  readonly startedAt:   string;
  readonly codeVersion: string;
}

export interface MonitorConcurrencyDocument {
  readonly limit:                        number;
  readonly agentsInFlight:               number;
  readonly machineLimit:                 number | null;
  readonly machineAgentsInFlight:        number | null;
  readonly ticketsWaitingForMachineSlot: number | null;
}

export interface MonitorAttentionEntryDocument {
  readonly key:                     string;
  readonly kind:                    MonitorAttentionKind;
  readonly idText:                  string;
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  readonly metaText:                string | null;
  readonly stamp:                   string;
  readonly stampWord:               MonitorAttentionStampWord;
  readonly actionLabel:             MonitorAttentionActionLabel;
  /** The thing the entry opens; a reader routes it to its own place for that subject. */
  readonly target:                  BoardTarget;
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
  readonly turn:                MonitorJobTurn | null;
  readonly messagesWaiting:     number;
  readonly lastLine:            string | null;
  readonly waitingOnDecisionId: string | null;
  /** The cause while the job is `interrupted`, from forge 1.19, absent from an older forge; `null` in every other state. */
  readonly interruption?:       MonitorInterruptionCause | null;
  readonly target:              BoardTarget;
}

/** A notice or a warning: the forge's kind and its own sentence. */
export interface MonitorNoticeDocument {
  readonly kind: string;
  readonly text: string;
}

export interface MonitorActivityEntryDocument {
  readonly logPosition: number;
  readonly at:          string;
  readonly category:    MonitorActivityCategory;
  readonly text:        string;
  /** `null` for an entry about the board's own. */
  readonly target:      BoardTarget | null;
}

export interface MonitorTodayDocument {
  readonly deliveredTickets: number;
  readonly tokens:           number;
}

/** The usage limit hit, both `null` when no limit was hit: the board summary's usage, and the monitor's under its current window. */
export interface UsageLimitDocument {
  readonly resetsAt: string | null;
  readonly window:   string | null;
}

/** The newest usage window a session of the board reported, under the limit or not, beside the limit hit; both `null` when none did. */
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
  /** The header's warnings: `baton-pass-failed` and `assistant-down`. */
  readonly warnings:       readonly MonitorNoticeDocument[];
  readonly today:          MonitorTodayDocument;
  readonly usage:          MonitorUsageDocument;
  readonly activity:       readonly MonitorActivityEntryDocument[];
}

/** An entity's kind: an app, a package, or the one root entity that owns every path no other entity owns. */
export type MonitorEntityKind = 'app' | 'package' | 'root';

/** The stages of a ticket that crosses into a whitelisted package, in the order a crossing first runs them. */
export type MonitorTicketStageName = 'build' | 'package-build' | 'package-review' | 'adapt' | 'review';

/** One entity of a forge at the repository's root, in the pipeline's order. */
export interface MonitorEntityDocument {
  readonly key:  string;
  readonly kind: MonitorEntityKind;
  /** Repository folders, each leading with `/`. */
  readonly home: readonly string[];
}

/** The stage a crossing ticket is in, and the entity whose agent runs it: the ticket's home entity, or the crossed package. */
export interface MonitorTicketStageDocument {
  readonly name:   MonitorTicketStageName;
  readonly entity: string;
}

/** An open ticket of a forge with entities: `entity` is `null` until the product owner assigns one, `stage` `null` until it crosses. */
export interface MonitorOpenTicketDocument {
  readonly id:     string;
  readonly entity: string | null;
  readonly stage:  MonitorTicketStageDocument | null;
}

/**
 * The keys a job of an entity adds to `MonitorJobDocument` from forge 1.14, each only when set: the entity whose stage the job runs, and that
 * stage's name. A job of a forge without entities has neither. Kept apart from `MonitorJobDocument`, so a client that checks every key of a
 * job keeps compiling until it adopts them.
 */
export interface MonitorJobEntityKeys {
  readonly entity?: string;
  readonly stage?:  MonitorTicketStageName;
}

/**
 * The keys a forge with entities adds to `MonitorSnapshotDocument` from forge 1.14: its entities, and each open ticket's entity and stage, in
 * board order. A forge without entities sends neither. Its jobs carry `MonitorJobEntityKeys`.
 */
export interface MonitorSnapshotEntityKeys {
  readonly entities?:    readonly MonitorEntityDocument[];
  readonly openTickets?: readonly MonitorOpenTicketDocument[];
}

/** The first event of `GET /api/v2/monitor/events`, `event: handshake`, sent before any `monitor` event. */
export interface MonitorStreamHandshake {
  readonly systemVersion: SystemVersion;
}

/** Each `monitor` event of `GET /api/v2/monitor/events`: the whole snapshot, and beside its keys the forge's system version. */
export interface MonitorEventDocument extends MonitorSnapshotDocument {
  readonly systemVersion: SystemVersion;
}
