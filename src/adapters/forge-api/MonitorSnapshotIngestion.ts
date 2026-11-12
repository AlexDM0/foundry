/**
 * The ingestion of a forge's monitor snapshot (F2, F3): check `monitorVersion` against `CONTRACT_VERSIONS`, check the keys Gaia reads, map
 * to a `ForgeReading` at fidelity `full`. A snapshot at a newer version maps nothing of itself; nor does a malformed one, or one that
 * names another forge.
 */
import type { ForgeReading }                                            from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }                                            from '../../shared/constants/ContractVersions.ts';
import type { ForgeDocumentReading, ForgeIdentity, ForgeRegistryFacts } from './@types/ForgeDocumentReading.ts';
import type {
  MonitorActivityEntryDocument,
  MonitorAttentionEntryDocument,
  MonitorConcurrencyDocument,
  MonitorJobDocument,
  MonitorNoticeDocument,
  MonitorOverseerDocument,
  MonitorSnapshotDocument,
  MonitorTodayDocument,
  MonitorUsageDocument,
} from './@types/MonitorSnapshotDocument.ts';
import { DocumentShapeUtil, type ShapeOf } from './utils/DocumentShapeUtil.ts';
import { ForgeReadingMapUtil }             from './utils/ForgeReadingMapUtil.ts';

const VERSION_KEY = 'monitorVersion';

const NULLABLE_TEXT = { nullable: 'text' } as const;
const NULLABLE_WHOLE_NUMBER = { nullable: 'whole-number' } as const;

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
  machineLimit:                 { optional: NULLABLE_WHOLE_NUMBER },
  machineAgentsInFlight:        { optional: NULLABLE_WHOLE_NUMBER },
  ticketsWaitingForMachineSlot: { optional: NULLABLE_WHOLE_NUMBER },
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
  route:                   'text',
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
  turn:                'whole-number',
  messagesWaiting:     'whole-number',
  lastLine:            NULLABLE_TEXT,
  waitingOnDecisionId: NULLABLE_TEXT,
  route:               'text',
} as const satisfies ShapeOf<MonitorJobDocument>;

const NOTICE_SHAPE = { kind: 'text', text: 'text' } as const satisfies ShapeOf<MonitorNoticeDocument>;

const ACTIVITY_ENTRY_SHAPE = {
  logPosition: 'whole-number',
  at:          'text',
  category:    { oneOf: ['needs-user', 'landed', 'agent', 'forge'] },
  text:        'text',
  route:       NULLABLE_TEXT,
} as const satisfies ShapeOf<MonitorActivityEntryDocument>;

const TODAY_SHAPE = { deliveredTickets: 'whole-number', tokens: 'whole-number' } as const satisfies ShapeOf<MonitorTodayDocument>;

const USAGE_SHAPE = { resetsAt: NULLABLE_TEXT, window: NULLABLE_TEXT } as const satisfies ShapeOf<MonitorUsageDocument>;

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
  warnings:       { listOf: NOTICE_SHAPE },
  today:          { object: TODAY_SHAPE },
  usage:          { object: USAGE_SHAPE },
  activity:       { listOf: ACTIVITY_ENTRY_SHAPE },
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
    const version = DocumentShapeUtil.topLevelValueOf(document, VERSION_KEY);
    if (!DocumentShapeUtil.isWholeNumber(version)) return { verdict: 'malformed', invalidKeys: [VERSION_KEY] };
    if (version > CONTRACT_VERSIONS.forgeMonitor) {
      return {
        verdict:  'newer-contract',
        contract: 'monitor',
        version,
        reading:  this.#newerContractReadingAt(version),
      };
    }
    if (version < CONTRACT_VERSIONS.forgeMonitor) return { verdict: 'older-contract', contract: 'monitor', version };

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
