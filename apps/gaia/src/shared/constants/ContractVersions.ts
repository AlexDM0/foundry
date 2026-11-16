/**
 * The one version Gaia knows of every versioned contract it reads, writes, sends or serves; an Overseer's come from `forge-contracts`,
 * which forge produces, as the forge version Gaia supports serves them. An endpoint's document, a program's answer and a message channel
 * carry one whole version, the integer key they have always carried; a stored file carries a format version as a major and a minor.
 * `ContractVersionUtil` holds the reading rule. Whether Gaia can talk to a forge at all is its system version's to say
 * (`ForgeVersionsUtil`), not these.
 */
import { FRAME_ANCESTOR_RECORD_FORMAT }                              from 'forge-contracts/FrameAncestorRecord';
import { FLINT_BRAIN_CONTRACT_VERSIONS, OVERSEER_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';

import type { FormatVersion } from '../utils/ContractVersionUtil.ts';

/** Forge 1.0, the version Gaia supports, serves the control contract before Flint's brain's: its two commands come with forge 1.1. */
const CONTROL_VERSION_BEFORE_FLINT_BRAIN = FLINT_BRAIN_CONTRACT_VERSIONS.control - 1;

export const CONTRACT_VERSIONS = {
  forgeRegistry:            { major: 1, minor: 0 },
  forgeIdentity:            OVERSEER_CONTRACT_VERSIONS.identity,
  forgeBoardSummary:        OVERSEER_CONTRACT_VERSIONS.summary,
  forgeMonitor:             OVERSEER_CONTRACT_VERSIONS.monitor,
  forgeControl:             CONTROL_VERSION_BEFORE_FLINT_BRAIN,
  forgeEmbedChannel:        OVERSEER_CONTRACT_VERSIONS.embed,
  forgeProgramAnswer:       1,
  forgeMachineLimits:       { major: 1, minor: 0 },
  forgeFrameAncestorRecord: { major: FRAME_ANCESTOR_RECORD_FORMAT.major, minor: FRAME_ANCESTOR_RECORD_FORMAT.minor },
  gaiaSettings:             { major: 1, minor: 0 },
  gaiaFleetDocument:        4,
  gaiaCommand:              2,
  gaiaCommandAnswer:        3,
  gaiaFrameSession:         1,
  gaiaHealth:               1,
  gaiaProgramAnswer:        1,
  boundaryRecording:        { major: 1, minor: 0 },
} as const satisfies Readonly<Record<string, number | FormatVersion>>;
