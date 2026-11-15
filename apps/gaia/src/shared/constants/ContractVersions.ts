/**
 * The current version Gaia knows of every versioned contract it reads, writes, sends or serves; an Overseer's come from
 * `forge-contracts`, which forge produces. An endpoint's document, a program's answer and a message channel carry one whole version,
 * the integer key they have always carried; a stored file carries a format version as a major and a minor. `ContractVersionUtil` holds the
 * reading rule. Whether Gaia can talk to a forge at all is its system version's to say (`ForgeVersionsUtil`), not these.
 */
import { OLDER_OVERSEER_CONTRACT_VERSIONS, OVERSEER_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';

import type { FormatVersion } from '../utils/ContractVersionUtil.ts';

export const CONTRACT_VERSIONS = {
  forgeRegistry:      { major: 1, minor: 0 },
  forgeIdentity:      OVERSEER_CONTRACT_VERSIONS.identity,
  forgeBoardSummary:  OVERSEER_CONTRACT_VERSIONS.summary,
  forgeMonitor:       OVERSEER_CONTRACT_VERSIONS.monitor,
  forgeControl:       OVERSEER_CONTRACT_VERSIONS.control,
  forgeEmbedChannel:  OVERSEER_CONTRACT_VERSIONS.embed,
  forgeProgramAnswer: 1,
  forgeMachineLimits: { major: 1, minor: 0 },
  gaiaSettings:       { major: 1, minor: 0 },
  gaiaServerRecord:   { major: 1, minor: 0 },
  gaiaFleetDocument:  4,
  gaiaCommand:        2,
  gaiaCommandAnswer:  3,
  gaiaFrameSession:   1,
  gaiaHealth:         1,
  gaiaProgramAnswer:  1,
  boundaryRecording:  { major: 1, minor: 0 },
} as const satisfies Readonly<Record<string, number | FormatVersion>>;

/**
 * The older versions of a contract that Gaia still reads, each migrated on its ingestion to the current version's shape. A control
 * version is one Gaia still sends: every command but those the later versions add.
 */
export const OLDER_CONTRACT_VERSIONS_READ: { readonly forgeMonitor: readonly number[]; readonly forgeControl: readonly number[] } = {
  forgeMonitor: OLDER_OVERSEER_CONTRACT_VERSIONS.monitor,
  forgeControl: OLDER_OVERSEER_CONTRACT_VERSIONS.control,
};
