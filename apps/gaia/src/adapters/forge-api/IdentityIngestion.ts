/**
 * The ingestion of a Hephaestus's identity (F1): check `identityVersion` against `CONTRACT_VERSIONS`, check the keys, map to a
 * `ForgeIdentity`, and decide from its `contracts` whether Gaia reads the forge (`docs/architecture.md`, "A reading, from forge to
 * screen"): only a forge that serves the monitor contract Gaia knows is read. An identity without `identityVersion` is a forge's from
 * before F1, older than Gaia reads.
 */
import type { IdentityContractsDocument, IdentityDocument } from 'forge-contracts/IdentityDocument';

import { DocumentShapeUtil, type ShapeOf } from '../../lib/json-value/DocumentShapeUtil.ts';
import type { ForgeContracts }             from '../../shared/@types/ForgeReading.ts';
import { CONTRACT_VERSIONS }               from '../../shared/constants/ContractVersions.ts';
import { ContractVersionUtil }             from '../../shared/utils/ContractVersionUtil.ts';
import type {
  ForgeContractName,
  ForgeIdentity,
  ForgeRegistryFacts,
  MalformedVerdict,
  NewerContractVerdict,
  OlderContractVerdict,
} from './@types/ForgeDocumentReading.ts';
import { ForgeReadingMapUtil } from './utils/ForgeReadingMapUtil.ts';

export type IdentityReading =
  | { readonly verdict: 'readable'; readonly identity: ForgeIdentity }
  /** Another forge answers at the address the registry names for this one: Gaia reads this forge as unreachable. */
  | { readonly verdict: 'another-forge'; readonly trackerId: string }
  | NewerContractVerdict
  | OlderContractVerdict
  | MalformedVerdict;

const VERSION_KEYS = { majorKey: 'identityVersion' } as const;

const OPTIONAL_WHOLE_NUMBER = { optional: 'whole-number' } as const;

const CONTRACTS_SHAPE = {
  summary: OPTIONAL_WHOLE_NUMBER,
  monitor: OPTIONAL_WHOLE_NUMBER,
  control: OPTIONAL_WHOLE_NUMBER,
} as const satisfies ShapeOf<IdentityContractsDocument>;

const IDENTITY_SHAPE = {
  identityVersion: 'whole-number',
  application:     { oneOf: ['forge'] },
  trackerId:       'text',
  project:         'text',
  codeVersion:     'text',
  installVersion:  'whole-number',
  processId:       'whole-number',
  contracts:       { object: CONTRACTS_SHAPE },
} as const satisfies ShapeOf<IdentityDocument>;

export class IdentityIngestion {
  readonly #registryFacts: ForgeRegistryFacts;

  public constructor(registryFacts: ForgeRegistryFacts) {
    this.#registryFacts = registryFacts;
  }

  public readingOf(document: unknown): IdentityReading {
    const versionReading = ContractVersionUtil.versionOf(document, VERSION_KEYS);
    if (versionReading.verdict === 'malformed') return { verdict: 'malformed', invalidKeys: [versionReading.invalidKey] };
    if (versionReading.verdict === 'unversioned') return { verdict: 'older-contract', contract: 'identity', version: null };
    const { major } = versionReading.version;
    const majorVerdict = ContractVersionUtil.majorVerdictOf(major, CONTRACT_VERSIONS.forgeIdentity);
    if (majorVerdict === 'newer') return this.#newerContract('identity', major, null, ForgeReadingMapUtil.contractsWith(null, {}));
    if (majorVerdict !== 'known') return { verdict: 'older-contract', contract: 'identity', version: major };

    const invalidKeys = DocumentShapeUtil.invalidKeysOf(document, IDENTITY_SHAPE);
    if (invalidKeys.length > 0) return { verdict: 'malformed', invalidKeys };
    const identity = ForgeReadingMapUtil.identityOf(document as IdentityDocument);
    if (identity.trackerId !== this.#registryFacts.trackerId) return { verdict: 'another-forge', trackerId: identity.trackerId };
    return this.#readingByContracts(identity);
  }

  /** The forge is read when it serves the monitor at the number Gaia knows; whether through the monitor or its summary is the watch's to decide. */
  #readingByContracts(identity: ForgeIdentity): IdentityReading {
    const monitor = identity.contracts?.monitor ?? null;
    const monitorVerdict = monitor === null ? 'older' : ContractVersionUtil.majorVerdictOf(monitor, CONTRACT_VERSIONS.forgeMonitor);
    if (monitorVerdict === 'known') return { verdict: 'readable', identity };
    if (monitor !== null && monitorVerdict === 'newer') return this.#newerContract('monitor', monitor, identity, ForgeReadingMapUtil.contractsWith(identity, {}));
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
