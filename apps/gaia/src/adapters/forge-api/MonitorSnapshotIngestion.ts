/**
 * The ingestion of a forge's monitor snapshot (F2, F3, G1): check `monitorVersion` against `CONTRACT_VERSIONS`, check the keys Gaia reads
 * at that number, map to a `ForgeReading` at fidelity `full`. A snapshot at another version maps nothing of itself; nor does a malformed
 * one, or one that names another forge.
 */
import { MONITOR_INTERRUPTION_CAUSES } from 'forge-contracts/MonitorInterruptionCauses';
import type {
  MonitorActivityEntryDocument,
  MonitorAttentionEntryDocument,
  MonitorConcurrencyDocument,
  MonitorFlintBrainDocument,
  MonitorFlintBrainMoveDocument,
  MonitorFlintBrainRefusalDocument,
  MonitorJobDocument,
  MonitorNoticeDocument,
  MonitorOverseerDocument,
  MonitorSnapshotDocument,
  MonitorTodayDocument,
  MonitorUsageDocument,
  UsageLimitDocument,
} from 'forge-contracts/MonitorSnapshotDocument';

import { DocumentShapeUtil, type ShapeOf }                              from '../../lib/json-value/DocumentShapeUtil.ts';
import type { ForgeReading }                                            from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }                                            from '../../shared/constants/ContractVersions.ts';
import { ContractVersionUtil }                                          from '../../shared/utils/ContractVersionUtil.ts';
import type { ForgeDocumentReading, ForgeIdentity, ForgeRegistryFacts } from './@types/ForgeDocumentReading.ts';
import { TARGET_SHAPE }                                                 from './constants/BoardDocumentShapes.ts';
import { ForgeReadingMapUtil }                                          from './utils/ForgeReadingMapUtil.ts';

const VERSION_KEYS = { majorKey: 'monitorVersion' } as const;

const NULLABLE_TEXT = { nullable: 'text' } as const;
const NULLABLE_WHOLE_NUMBER = { nullable: 'whole-number' } as const;
const TARGET_OBJECT = { object: TARGET_SHAPE } as const;

const OVERSEER_SHAPE = {
  state:       { oneOf: ['serving', 'held-by-install-change', 'passing-baton'] },
  paused:      'boolean',
  url:         'text',
  processId:   'whole-number',
  startedAt:   'text',
  codeVersion: 'text',
} as const satisfies ShapeOf<MonitorOverseerDocument>;

const CONCURRENCY_SHAPE = {
  limit:                        'whole-number',
  agentsInFlight:               'whole-number',
  machineLimit:                 NULLABLE_WHOLE_NUMBER,
  machineAgentsInFlight:        NULLABLE_WHOLE_NUMBER,
  ticketsWaitingForMachineSlot: NULLABLE_WHOLE_NUMBER,
} as const satisfies ShapeOf<MonitorConcurrencyDocument>;

const ATTENTION_ENTRY_SHAPE = {
  key:                     'text',
  kind:                    { oneOf: ['escalated-question', 'question', 'draft-ticket', 'filing-draft', 'review', 'merge-accept'] },
  idText:                  'text',
  ticketIds:               'text-list',
  subject:                 'text',
  jobId:                   NULLABLE_TEXT,
  askedBy:                 NULLABLE_TEXT,
  decisionKind:            NULLABLE_TEXT,
  escalatedFromIncidentId: NULLABLE_TEXT,
  metaText:                NULLABLE_TEXT,
  stamp:                   'text',
  stampWord:               { oneOf: ['opened', 'filed', 'ready since', 'reviewed'] },
  actionLabel:             { oneOf: ['Answer', 'Ready', 'Review', 'Accept'] },
  target:                  TARGET_OBJECT,
} as const satisfies ShapeOf<MonitorAttentionEntryDocument>;

const JOB_SHAPE = {
  id:                  'text',
  kind:                'text',
  role:                NULLABLE_TEXT,
  state:               'text',
  ticketIds:           'text-list',
  ticketTitle:         NULLABLE_TEXT,
  attempt:             'whole-number',
  startedAt:           'text',
  calls:               'whole-number',
  callBudget:          NULLABLE_WHOLE_NUMBER,
  tokens:              'whole-number',
  toolCalls:           'whole-number',
  lastToolCall:        NULLABLE_TEXT,
  runningSubagents:    'whole-number',
  silentSweeps:        'whole-number',
  quiet:               'boolean',
  turn:                { nullable: { oneOf: ['between-turns', 'mid-turn'] } },
  messagesWaiting:     'whole-number',
  lastLine:            NULLABLE_TEXT,
  waitingOnDecisionId: NULLABLE_TEXT,
  interruption:        { optional: { nullable: { oneOf: MONITOR_INTERRUPTION_CAUSES } } },
  target:              TARGET_OBJECT,
} as const satisfies ShapeOf<MonitorJobDocument>;

const NOTICE_SHAPE = { kind: 'text', text: 'text' } as const satisfies ShapeOf<MonitorNoticeDocument>;

/** An entry's kind is read as text: a kind this Gaia does not know is shown by its category, as an entry of no kind is. */
const ACTIVITY_ENTRY_SHAPE = {
  logPosition: 'whole-number',
  at:          'text',
  category:    { oneOf: ['needs-user', 'landed', 'agent', 'forge'] },
  text:        'text',
  target:      { nullable: TARGET_OBJECT },
  kind:        { optional: NULLABLE_TEXT },
  tokens:      { optional: NULLABLE_WHOLE_NUMBER },
} as const satisfies ShapeOf<MonitorActivityEntryDocument>;

const TODAY_SHAPE = { deliveredTickets: 'whole-number', tokens: 'whole-number' } as const satisfies ShapeOf<MonitorTodayDocument>;

const USAGE_LIMIT_SHAPE = { resetsAt: NULLABLE_TEXT, window: NULLABLE_TEXT } as const satisfies ShapeOf<UsageLimitDocument>;

const USAGE_SHAPE = {
  ...USAGE_LIMIT_SHAPE,
  currentWindow:         NULLABLE_TEXT,
  currentWindowResetsAt: NULLABLE_TEXT,
} as const satisfies ShapeOf<MonitorUsageDocument>;

/** A warning's kind is read as text: a kind this Gaia does not know is shown as a warning, worded only by the command guard. */
const WARNING_SHAPE = NOTICE_SHAPE;

const FLINT_BRAIN_MOVE_SHAPE = {
  at:     'text',
  intent: 'text',
  emote:  NULLABLE_TEXT,
} as const satisfies ShapeOf<MonitorFlintBrainMoveDocument>;

const FLINT_BRAIN_REFUSAL_SHAPE = { code: 'text', sentence: 'text' } as const satisfies ShapeOf<MonitorFlintBrainRefusalDocument>;

const FLINT_BRAIN_SHAPE = {
  state:       { oneOf: ['off', 'starting', 'running', 'ended', 'refused'] },
  startedAt:   NULLABLE_TEXT,
  endsAt:      NULLABLE_TEXT,
  startedBy:   { nullable: { oneOf: ['bridge', 'api'] } },
  model:       NULLABLE_TEXT,
  effort:      NULLABLE_TEXT,
  tokens:      NULLABLE_WHOLE_NUMBER,
  calls:       NULLABLE_WHOLE_NUMBER,
  recentMoves: { listOf: FLINT_BRAIN_MOVE_SHAPE },
  endedAt:     NULLABLE_TEXT,
  endedReason: { nullable: { oneOf: ['time', 'stopped', 'usage-limit', 'failed'] } },
  sentence:    NULLABLE_TEXT,
  refusal:     { nullable: { object: FLINT_BRAIN_REFUSAL_SHAPE } },
} as const satisfies ShapeOf<MonitorFlintBrainDocument>;

const MONITOR_SNAPSHOT_SHAPE = {
  monitorVersion: 'whole-number',
  trackerId:      'text',
  project:        'text',
  root:           'text',
  overseer:       { object: OVERSEER_SHAPE },
  concurrency:    { object: CONCURRENCY_SHAPE },
  readyTicketIds: 'text-list',
  openIncidents:  'whole-number',
  attention:      { listOf: ATTENTION_ENTRY_SHAPE },
  jobs:           { listOf: JOB_SHAPE },
  notices:        { listOf: NOTICE_SHAPE },
  warnings:       { listOf: WARNING_SHAPE },
  today:          { object: TODAY_SHAPE },
  usage:          { object: USAGE_SHAPE },
  activity:       { listOf: ACTIVITY_ENTRY_SHAPE },
  flintBrain:     { nullable: { object: FLINT_BRAIN_SHAPE } },
} as const satisfies ShapeOf<MonitorSnapshotDocument>;

export class MonitorSnapshotIngestion {
  readonly #registryFacts: ForgeRegistryFacts;
  readonly #identity:      ForgeIdentity;

  public constructor(registryFacts: ForgeRegistryFacts, identity: ForgeIdentity) {
    this.#registryFacts = registryFacts;
    this.#identity      = identity;
  }

  /** `readAt` is when Gaia received the snapshot, from the injected clock: shown as "as last reported", never compared. */
  public readingOf(document: unknown, readAt: string): ForgeDocumentReading {
    const versionReading = ContractVersionUtil.versionOf(document, VERSION_KEYS);
    if (versionReading.verdict === 'unversioned') return { verdict: 'malformed', invalidKeys: [VERSION_KEYS.majorKey] };
    if (versionReading.verdict === 'malformed') return { verdict: 'malformed', invalidKeys: [versionReading.invalidKey] };
    const version = versionReading.version.major;
    const majorVerdict = ContractVersionUtil.majorVerdictOf(version, CONTRACT_VERSIONS.forgeMonitor);
    if (majorVerdict === 'newer') {
      return {
        verdict:  'newer-contract',
        contract: 'monitor',
        version,
        reading:  this.#newerContractReadingAt(version),
      };
    }
    if (majorVerdict === 'older') return { verdict: 'older-contract', contract: 'monitor', version };

    const invalidKeys = DocumentShapeUtil.invalidKeysOf(document, MONITOR_SNAPSHOT_SHAPE);
    if (invalidKeys.length > 0) return { verdict: 'malformed', invalidKeys };
    const snapshot = document as MonitorSnapshotDocument;
    // A snapshot of another forge must never be shown as this one.
    if (snapshot.trackerId !== this.#registryFacts.trackerId) return { verdict: 'malformed', invalidKeys: ['trackerId'] };
    return { verdict: 'readable', reading: ForgeReadingMapUtil.fullReadingOf(snapshot, this.#registryFacts, this.#identity, readAt) };
  }

  #newerContractReadingAt(version: number): ForgeReading {
    const contracts = ForgeReadingMapUtil.contractsWith(this.#identity, { monitor: version });
    return ForgeReadingMapUtil.newerContractReadingOf(this.#registryFacts, this.#identity, contracts);
  }
}
