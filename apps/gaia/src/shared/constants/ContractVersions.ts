/**
 * The one version Gaia knows of every contract it reads, writes or sends to a forge, and of the files it stores; a Hephaestus's come from
 * `forge-contracts`. Its page's contracts are `PAGE_CONTRACT_VERSIONS`, kept apart so the page never reaches `forge-contracts`. Whether Gaia can
 * talk to a forge at all is its system version's to say (`ForgeVersionsUtil`).
 */
import { HEPHAESTUS_CONTRACT_VERSIONS } from 'forge-contracts/HephaestusContractVersions';

import type { FormatVersion } from '../utils/ContractVersionUtil.ts';

export const CONTRACT_VERSIONS = {
  forgeRegistry:      { major: 2, minor: 0 },
  forgeIdentity:      HEPHAESTUS_CONTRACT_VERSIONS.identity,
  forgeBoardSummary:  HEPHAESTUS_CONTRACT_VERSIONS.summary,
  forgeMonitor:       HEPHAESTUS_CONTRACT_VERSIONS.monitor,
  forgeControl:       HEPHAESTUS_CONTRACT_VERSIONS.control,
  forgeProgramAnswer: 3,
  forgeMachineLimits: { major: 1, minor: 0 },
  gaiaSettings:       { major: 1, minor: 0 },
  gaiaProgramAnswer:  1,
  boundaryRecording:  { major: 1, minor: 0 },
} as const satisfies Readonly<Record<string, number | FormatVersion>>;
