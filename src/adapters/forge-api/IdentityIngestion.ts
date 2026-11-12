/**
 * The ingestion of an Overseer's identity (F1): check `identityVersion` against `CONTRACT_VERSIONS`, check the keys, map to a
 * `ForgeIdentity`, and decide from its `contracts` how Gaia reads the forge (PLAN 7.1): in full through the monitor, as counts through the
 * summary, or not at all when the forge speaks only newer contracts. An identity without `identityVersion` is the forge's from before F1.
 */
import type { ForgeContracts } from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }   from '../../shared/constants/ContractVersions.ts';
import type {
  ForgeContractName,
  ForgeIdentity,
  ForgeRegistryFacts,
  MalformedVerdict,
  NewerContractVerdict,
  OlderContractVerdict,
} from './@types/ForgeDocumentReading.ts';
import type { IdentityContractsDocument, IdentityDocument } from './@types/IdentityDocument.ts';
import { DocumentShapeUtil, type ShapeOf }                  from './utils/DocumentShapeUtil.ts';
import { ForgeReadingMapUtil }                              from './utils/ForgeReadingMapUtil.ts';

export type IdentityReading =
  | { readonly verdict: 'readable'; readonly identity: ForgeIdentity; readonly fidelity: 'full' | 'counts-only' }
  /** Another forge answers at the address the registry names for this one: PLAN 7.1 reads this forge as unreachable. */
  | { readonly verdict: 'another-forge'; readonly trackerId: string }
  | NewerContractVerdict
  | OlderContractVerdict
  | MalformedVerdict;

const VERSION_KEY = 'identityVersion';

const OPTIONAL_WHOLE_NUMBER = { optional: 'whole-number' } as const;

const CONTRACTS_SHAPE = {
  summary: OPTIONAL_WHOLE_NUMBER,
  monitor: OPTIONAL_WHOLE_NUMBER,
  control: OPTIONAL_WHOLE_NUMBER,
  embed:   OPTIONAL_WHOLE_NUMBER,
} as const satisfies ShapeOf<IdentityContractsDocument>;

const IDENTITY_SHAPE = {
  identityVersion: OPTIONAL_WHOLE_NUMBER,
  application:     { oneOf: ['forge'] },
  trackerId:       'text',
  project:         'text',
  codeVersion:     'text',
  installVersion:  'whole-number',
  processId:       'whole-number',
  contracts:       { optional: { object: CONTRACTS_SHAPE } },
} as const satisfies ShapeOf<IdentityDocument>;

export class IdentityIngestion {
  readonly #registryFacts: ForgeRegistryFacts;

  public constructor(registryFacts: ForgeRegistryFacts) {
    this.#registryFacts = registryFacts;
  }

  public readingOf(document: unknown): IdentityReading {
    const version = DocumentShapeUtil.topLevelValueOf(document, VERSION_KEY);
    if (version !== undefined) {
      if (!DocumentShapeUtil.isWholeNumber(version)) return { verdict: 'malformed', invalidKeys: [VERSION_KEY] };
      if (version > CONTRACT_VERSIONS.forgeIdentity) return this.#newerContract('identity', version, null, ForgeReadingMapUtil.contractsWith(null, {}));
      if (version < CONTRACT_VERSIONS.forgeIdentity) return { verdict: 'older-contract', contract: 'identity', version };
    }

    const invalidKeys = DocumentShapeUtil.invalidKeysOf(document, IDENTITY_SHAPE);
    if (invalidKeys.length > 0) return { verdict: 'malformed', invalidKeys };
    const identity = ForgeReadingMapUtil.identityOf(document as IdentityDocument);
    if (identity.trackerId !== this.#registryFacts.trackerId) return { verdict: 'another-forge', trackerId: identity.trackerId };
    return this.#readingByContracts(identity);
  }

  /** The monitor is read when the forge serves it at the known number; the summary when it does not, or names no contracts at all. */
  #readingByContracts(identity: ForgeIdentity): IdentityReading {
    const { contracts } = identity;
    if (contracts === null) return { verdict: 'readable', identity, fidelity: 'counts-only' };
    const { monitor, summary } = contracts;
    if (monitor === CONTRACT_VERSIONS.forgeMonitor) return { verdict: 'readable', identity, fidelity: 'full' };
    if (monitor !== null && monitor > CONTRACT_VERSIONS.forgeMonitor) return this.#newerContract('monitor', monitor, identity, contracts);
    if (summary === CONTRACT_VERSIONS.forgeBoardSummary) return { verdict: 'readable', identity, fidelity: 'counts-only' };
    if (summary !== null && summary > CONTRACT_VERSIONS.forgeBoardSummary) return this.#newerContract('summary', summary, identity, contracts);
    return { verdict: 'older-contract', contract: 'monitor', version: monitor };
  }

  #newerContract(contract: ForgeContractName, version: number, identity: ForgeIdentity | null, contracts: ForgeContracts): NewerContractVerdict {
    return {
      verdict: 'newer-contract',
      contract,
      version,
      reading: ForgeReadingMapUtil.newerContractReadingOf(this.#registryFacts, identity, contracts),
    };
  }
}
