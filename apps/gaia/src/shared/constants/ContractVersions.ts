/**
 * The one version Gaia knows of every versioned contract it reads, writes or sends to a forge, and of the files it stores; an Overseer's
 * come from `forge-contracts`, which forge produces, as the forge version Gaia supports serves them. The contracts Gaia's server serves its
 * own page and launcher are `PAGE_CONTRACT_VERSIONS` (`PageContractVersions.ts`), which the page may import and this file may not, since it
 * reaches `forge-contracts`. An endpoint's document, a program's answer and a message channel carry one whole version, the integer key they
 * have always carried; a stored file carries a format version as a major and a minor. `ContractVersionUtil` holds the reading rule.
 * Whether Gaia can talk to a forge at all is its system version's to say (`ForgeVersionsUtil`), not these.
 */
import { OVERSEER_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';

import type { FormatVersion } from '../utils/ContractVersionUtil.ts';

export const CONTRACT_VERSIONS = {
  forgeRegistry:      { major: 1, minor: 0 },
  forgeIdentity:      OVERSEER_CONTRACT_VERSIONS.identity,
  forgeBoardSummary:  OVERSEER_CONTRACT_VERSIONS.summary,
  forgeMonitor:       OVERSEER_CONTRACT_VERSIONS.monitor,
  forgeControl:       OVERSEER_CONTRACT_VERSIONS.control,
  forgeProgramAnswer: 2,
  forgeMachineLimits: { major: 1, minor: 0 },
  gaiaSettings:       { major: 1, minor: 0 },
  gaiaProgramAnswer:  1,
  boundaryRecording:  { major: 1, minor: 0 },
} as const satisfies Readonly<Record<string, number | FormatVersion>>;
