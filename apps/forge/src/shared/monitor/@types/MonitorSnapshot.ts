/**
 * `GET /api/monitor` and each `monitor` event of `GET /api/monitor/events`: what a monitor outside the board needs, and no ticket body,
 * transcript or draft text. `monitorVersion` is the version of the shape. Every sentence in it is worded by the forge. Each document
 * extends the one `forge-contracts` publishes, so a key or a value the package's readers check cannot drift from what forge sends.
 */
import type { BoardTarget } from 'forge-contracts/BoardReadingDocuments';
import type {
  MonitorActivityCategory,
  MonitorActivityEntryDocument,
  MonitorAttentionActionLabel,
  MonitorAttentionEntryDocument,
  MonitorAttentionKind,
  MonitorAttentionStampWord,
  MonitorEntityDocument,
  MonitorInterruptionCause,
  MonitorJobDocument,
  MonitorJobEntityKeys,
  MonitorJobTurn as MonitorJobTurnDocument,
  MonitorNoticeDocument,
  MonitorOpenTicketDocument,
  MonitorHephaestusState as MonitorHephaestusStateDocument,
  MonitorSnapshotDocument,
  MonitorSnapshotEntityKeys,
  MonitorTicketStageName,
  MonitorUsageDocument
} from 'forge-contracts/MonitorSnapshotDocument';

import type { SERVED_CONTRACT_VERSIONS } from '../../constants/HephaestusApiContracts.ts';

export type MonitorHephaestusState = MonitorHephaestusStateDocument;

export type AttentionKind = MonitorAttentionKind;

export type AttentionStampWord = MonitorAttentionStampWord;

export type AttentionActionLabel = MonitorAttentionActionLabel;

export type ActivityCategory = MonitorActivityCategory;

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type MonitorJobTurn = MonitorJobTurnDocument;

/** One thing that waits on User: the board document's attention holds the same entries. */
export interface MonitorAttentionEntry extends MonitorAttentionEntryDocument {
  /** `decision:E3`, `ticket:009`, `draft:D2`, `merge-accept:005`. */
  readonly key:                     string;
  readonly kind:                    AttentionKind;
  /** `E3`, `#009`, `D2`. */
  readonly idText:                  string;
  /** A decision's tickets; empty for a ticket's or a draft's own entry. */
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  /** Set only for a decision Hephaestus code opened, whose kind the entry names. */
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  /** The fixed words of a ticket's or a draft's entry. */
  readonly metaText:                string | null;
  /** What the age counts from; empty when the board does not hold it. */
  readonly stamp:                   string;
  readonly stampWord:               AttentionStampWord;
  readonly actionLabel:             AttentionActionLabel;
  /** The thing it opens, such as decision `E3`. */
  readonly target:                  BoardTarget;
}

export interface MonitorJob extends MonitorJobDocument, MonitorJobEntityKeys {
  readonly id:                  string;
  readonly kind:                string;
  readonly role:                string | null;
  readonly state:               string;
  readonly ticketIds:           readonly string[];
  /** The first ticket's title; `null` for a job with no ticket. */
  readonly ticketTitle:         string | null;
  readonly attempt:             number;
  /** The newest launch's stamp; empty when the log lost it. */
  readonly startedAt:           string;
  readonly calls:               number;
  readonly callBudget:          number | null;
  readonly tokens:              number;
  readonly toolCalls:           number;
  /** The newest tool call's tool name. */
  readonly lastToolCall:        string | null;
  readonly runningSubagents:    number;
  readonly silentSweeps:        number;
  /** True while a `quiet-job` incident is open for the job: the forge's own verdict. */
  readonly quiet:               boolean;
  /** `null` for a job with no agent session, and before its first child logged a line. */
  readonly turn:                MonitorJobTurn | null;
  readonly messagesWaiting:     number;
  /** The newest line of an Assistant's or a product owner's session; `null` for every other job. */
  readonly lastLine:            string | null;
  readonly waitingOnDecisionId: string | null;
  /** The cause while the job is `interrupted`; the board keeps the last cause after a resume, the snapshot does not. */
  readonly interruption:        MonitorInterruptionCause | null;
  readonly target:              BoardTarget;
  /** Only on a job of an entity: the entity whose stage it runs. */
  readonly entity?:             string;
  /** Only on a job of an entity that runs a stage: the stage's name. */
  readonly stage?:              MonitorTicketStageName;
}

export interface MonitorActivityEntry extends MonitorActivityEntryDocument {
  /** The record's index in the board's log, from 0. */
  readonly logPosition: number;
  readonly at:          string;
  readonly category:    ActivityCategory;
  readonly text:        string;
  readonly target:      BoardTarget | null;
}

export interface MonitorNotice extends MonitorNoticeDocument {
  readonly kind: string;
  readonly text: string;
}

/** Every warning the header can show: a failed restart, and an Assistant that cannot come up. */
export type MonitorWarningKind = 'restart-failed' | 'assistant-down';

export interface MonitorWarning extends MonitorNoticeDocument {
  readonly kind: MonitorWarningKind;
  readonly text: string;
}

export interface MonitorUsage extends MonitorUsageDocument {
  /** The usage limit hit, from the machine's usage marker; both `null` when no limit was hit. */
  readonly resetsAt:              string | null;
  readonly window:                string | null;
  /** The newest usage window a session on this board reported, under the limit or not; both `null` when no session reported one. */
  readonly currentWindow:         string | null;
  readonly currentWindowResetsAt: string | null;
}

export interface MonitorSnapshot extends MonitorSnapshotDocument, MonitorSnapshotEntityKeys {
  readonly monitorVersion: typeof SERVED_CONTRACT_VERSIONS.monitor;
  readonly trackerId:      string;
  readonly project:        string;
  readonly root:           string;
  readonly hephaestus:            {
    readonly state:             MonitorHephaestusState;
    readonly paused:            boolean;
    readonly url:               string;
    readonly processId:         number;
    readonly startedAt:         string;
    readonly generation:        number;
    readonly codeVersion:       string;
    readonly codeVersionOnDisk: string;
    readonly installVersion:    number;
  };
  readonly concurrency:         {
    readonly limit:                        number;
    readonly agentsInFlight:               number;
    readonly machineLimit:                 number;
    readonly machineAgentsInFlight:        number;
    readonly ticketsWaitingForMachineSlot: number;
  };
  readonly ticketCountByStatus: Readonly<Record<string, number>>;
  readonly readyTicketIds:      readonly string[];
  readonly openIncidents:       number;
  readonly attention:           readonly MonitorAttentionEntry[];
  readonly jobs:                readonly MonitorJob[];
  readonly notices:             readonly MonitorNotice[];
  readonly warnings:            readonly MonitorWarning[];
  readonly today:               { readonly deliveredTickets: number; readonly tokens: number };
  readonly usage:               MonitorUsage;
  readonly activity:            readonly MonitorActivityEntry[];
  /** Only on a forge with entities: each entity, in the pipeline's order. */
  readonly entities?:           readonly MonitorEntityDocument[];
  /** Only on a forge with entities: each ticket not delivered or abandoned, with its entity and the stage it is in, in board order. */
  readonly openTickets?:        readonly MonitorOpenTicketDocument[];
}
