/**
 * `GET /api/monitor` and each `monitor` event of `GET /api/monitor/events`: what a monitor outside the board needs, and no ticket body,
 * transcript or draft text. `monitorVersion` is the version of the shape. Every sentence in it is worded by the forge. Each document
 * extends the one `forge-contracts` publishes, so a key or a value the package's readers check cannot drift from what forge sends.
 */
import type {
  MonitorActivityCategory,
  MonitorActivityEntryDocument,
  MonitorAttentionActionLabel,
  MonitorAttentionEntryDocument,
  MonitorAttentionKind,
  MonitorAttentionStampWord,
  MonitorFlintBrainDocument,
  MonitorJobDocument,
  MonitorJobTurn as MonitorJobTurnDocument,
  MonitorNoticeDocument,
  MonitorOverseerState as MonitorOverseerStateDocument,
  MonitorSnapshotDocument,
  MonitorUsageDocument
} from 'forge-contracts/MonitorSnapshotDocument';

import type { SERVED_CONTRACT_VERSIONS } from '../../constants/OverseerApiContracts.ts';

export type MonitorOverseerState = MonitorOverseerStateDocument;

export type AttentionKind = MonitorAttentionKind;

export type AttentionStampWord = MonitorAttentionStampWord;

export type AttentionActionLabel = MonitorAttentionActionLabel;

export type ActivityCategory = MonitorActivityCategory;

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type MonitorJobTurn = MonitorJobTurnDocument;

/** One thing that waits on User: the Bridge's Waiting on User list holds the same entries. */
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
  /** Set only for a decision Overseer code opened, whose kind the entry names. */
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  /** The fixed words of a ticket's or a draft's entry. */
  readonly metaText:                string | null;
  /** What the age counts from; empty when the board does not hold it. */
  readonly stamp:                   string;
  readonly stampWord:               AttentionStampWord;
  readonly actionLabel:             AttentionActionLabel;
  /** The Bridge fragment that opens it, such as `#questions/E3`. */
  readonly route:                   string;
}

export interface MonitorJob extends MonitorJobDocument {
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
  /** `null` for a job with no agent session, and before its first Watcher logged a line. */
  readonly turn:                MonitorJobTurn | null;
  readonly messagesWaiting:     number;
  /** The newest line of an Assistant's or a product owner's session; `null` for every other job. */
  readonly lastLine:            string | null;
  readonly waitingOnDecisionId: string | null;
  readonly route:               string;
}

export interface MonitorActivityEntry extends MonitorActivityEntryDocument {
  /** The record's index in the board's log, from 0. */
  readonly logPosition: number;
  readonly at:          string;
  readonly category:    ActivityCategory;
  readonly text:        string;
  readonly route:       string | null;
  /** `flint-brain` on the entry an ended brain leaves, with its tokens; every other entry has neither. */
  readonly kind?:       'flint-brain';
  readonly tokens?:     number;
}

export interface MonitorNotice extends MonitorNoticeDocument {
  readonly kind: string;
  readonly text: string;
}

/** Every warning the header can show: a failed Baton pass, and an Assistant that cannot come up. */
export type MonitorWarningKind = 'baton-pass-failed' | 'assistant-down';

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

export interface MonitorSnapshot extends MonitorSnapshotDocument {
  readonly monitorVersion: typeof SERVED_CONTRACT_VERSIONS.monitor;
  readonly trackerId:      string;
  readonly project:        string;
  readonly root:           string;
  readonly overseer:            {
    readonly state:             MonitorOverseerState;
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
  /** Flint's brain, `null` where this forge cannot run it confined. */
  readonly flintBrain:          MonitorFlintBrainDocument | null;
}
