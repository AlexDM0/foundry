/**
 * The ingestion of a forge's board summary, for a forge without the monitor contract: check `summaryVersion` against `CONTRACT_VERSIONS`,
 * check the keys Gaia reads, map to a `ForgeReading` at fidelity `counts-only`. A summary at a newer version maps nothing of itself; nor
 * does a malformed one.
 */
import type { BoardSummaryDocument, SummaryJobDocument, SummaryHephaestusDocument } from 'forge-contracts/BoardSummaryDocument';
import type { UsageLimitDocument }                                                  from 'forge-contracts/MonitorSnapshotDocument';

import { DocumentShapeUtil, type ShapeOf }                              from '../../lib/json-value/DocumentShapeUtil.ts';
import type { ForgeReading }                                            from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }                                            from '../../shared/constants/ContractVersions.ts';
import { ContractVersionUtil }                                          from '../../shared/utils/ContractVersionUtil.ts';
import type { ForgeDocumentReading, ForgeIdentity, ForgeRegistryFacts } from './@types/ForgeDocumentReading.ts';
import { ForgeReadingMapUtil }                                          from './utils/ForgeReadingMapUtil.ts';

const VERSION_KEYS = { majorKey: 'summaryVersion' } as const;

const NULLABLE_TEXT = { nullable: 'text' } as const;

const HEPHAESTUS_SHAPE = {
  state:  { oneOf: ['serving', 'held-by-install-change', 'restarting', 'down'] },
  paused: 'boolean',
  url:    NULLABLE_TEXT,
} as const satisfies ShapeOf<SummaryHephaestusDocument>;

const JOB_SHAPE = {
  id:        'text',
  kind:      'text',
  ticketIds: 'text-list',
  state:     'text',
  role:      NULLABLE_TEXT,
  tokens:    'whole-number',
} as const satisfies ShapeOf<SummaryJobDocument>;

const USAGE_SHAPE = { resetsAt: NULLABLE_TEXT, window: NULLABLE_TEXT } as const satisfies ShapeOf<UsageLimitDocument>;

const BOARD_SUMMARY_SHAPE = {
  summaryVersion: 'whole-number',
  project:        'text',
  hephaestus:     { object: HEPHAESTUS_SHAPE },
  readyTicketIds: 'text-list',
  jobs:           { listOf: JOB_SHAPE },
  openDecisions:  'whole-number',
  openIncidents:  'whole-number',
  usage:          { object: USAGE_SHAPE },
} as const satisfies ShapeOf<BoardSummaryDocument>;

export class BoardSummaryIngestion {
  readonly #registryFacts: ForgeRegistryFacts;
  readonly #identity:      ForgeIdentity;

  public constructor(registryFacts: ForgeRegistryFacts, identity: ForgeIdentity) {
    this.#registryFacts = registryFacts;
    this.#identity      = identity;
  }

  /** `readAt` is when Gaia received the summary, from the injected clock: shown as "as last reported", never compared. */
  public readingOf(document: unknown, readAt: string): ForgeDocumentReading {
    const versionReading = ContractVersionUtil.versionOf(document, VERSION_KEYS);
    if (versionReading.verdict === 'unversioned') return { verdict: 'malformed', invalidKeys: [VERSION_KEYS.majorKey] };
    if (versionReading.verdict === 'malformed') return { verdict: 'malformed', invalidKeys: [versionReading.invalidKey] };
    const version = versionReading.version.major;
    const majorVerdict = ContractVersionUtil.majorVerdictOf(version, CONTRACT_VERSIONS.forgeBoardSummary);
    if (majorVerdict === 'newer') {
      return {
        verdict:  'newer-contract',
        contract: 'summary',
        version,
        reading:  this.#newerContractReadingAt(version),
      };
    }
    if (majorVerdict !== 'known') return { verdict: 'older-contract', contract: 'summary', version };

    const invalidKeys = DocumentShapeUtil.invalidKeysOf(document, BOARD_SUMMARY_SHAPE);
    if (invalidKeys.length > 0) return { verdict: 'malformed', invalidKeys };
    const summary = document as BoardSummaryDocument;
    return { verdict: 'readable', reading: ForgeReadingMapUtil.countsOnlyReadingOf(summary, this.#registryFacts, this.#identity, readAt) };
  }

  #newerContractReadingAt(version: number): ForgeReading {
    const contracts = ForgeReadingMapUtil.contractsWith(this.#identity, { summary: version });
    return ForgeReadingMapUtil.newerContractReadingOf(this.#registryFacts, this.#identity, contracts);
  }
}
