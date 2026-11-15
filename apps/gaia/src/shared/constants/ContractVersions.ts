/**
 * The current version Gaia knows of every versioned contract it reads, writes or serves, as major and minor; an Overseer's contracts come
 * from `overseer-contracts`, which forge produces. `ContractVersionUtil` holds the reading rule: a known major reads at any minor, an older
 * major only where `OLDER_CONTRACT_VERSIONS_READ` names it and its ingestion migrates it, a newer one never.
 */
import type { ContractVersion }                                       from 'overseer-contracts/ContractVersion';
import { OLDER_OVERSEER_CONTRACT_MAJORS, OVERSEER_CONTRACT_VERSIONS } from 'overseer-contracts/OverseerContractVersions';

export const CONTRACT_VERSIONS = {
  forgeRegistry:      { major: 1, minor: 0 },
  forgeIdentity:      OVERSEER_CONTRACT_VERSIONS.identity,
  forgeBoardSummary:  OVERSEER_CONTRACT_VERSIONS.summary,
  forgeMonitor:       OVERSEER_CONTRACT_VERSIONS.monitor,
  forgeControl:       OVERSEER_CONTRACT_VERSIONS.control,
  forgeEmbedChannel:  OVERSEER_CONTRACT_VERSIONS.embed,
  forgeProgramAnswer: { major: 1, minor: 0 },
  forgeMachineLimits: { major: 1, minor: 0 },
  gaiaSettings:       { major: 1, minor: 0 },
  gaiaServerRecord:   { major: 1, minor: 0 },
  gaiaFleetDocument:  { major: 3, minor: 0 },
  gaiaCommand:        { major: 2, minor: 0 },
  gaiaCommandAnswer:  { major: 3, minor: 0 },
  gaiaFrameSession:   { major: 1, minor: 0 },
  gaiaHealth:         { major: 1, minor: 0 },
  gaiaProgramAnswer:  { major: 1, minor: 0 },
  boundaryRecording:  { major: 1, minor: 0 },
} as const satisfies Readonly<Record<string, ContractVersion>>;

/**
 * The older majors of a contract that Gaia still reads, each migrated on its ingestion to the current major's shape. A control major is
 * one Gaia still sends: every command but those the later majors add.
 */
export const OLDER_CONTRACT_VERSIONS_READ: { readonly forgeMonitor: readonly number[]; readonly forgeControl: readonly number[] } = {
  forgeMonitor: OLDER_OVERSEER_CONTRACT_MAJORS.monitor,
  forgeControl: OLDER_OVERSEER_CONTRACT_MAJORS.control,
};
