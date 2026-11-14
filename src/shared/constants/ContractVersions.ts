/**
 * The current version Gaia knows of every versioned contract it reads, writes or serves. A reading at another number never reaches a mapper,
 * except at a number `OLDER_CONTRACT_VERSIONS_READ` names, which its ingestion migrates to the current one.
 */
export const CONTRACT_VERSIONS = {
  forgeRegistry:      1,
  forgeIdentity:      1,
  forgeBoardSummary:  1,
  forgeMonitor:       3,
  forgeControl:       2,
  forgeEmbedChannel:  1,
  forgeProgramAnswer: 1,
  forgeMachineLimits: 1,
  gaiaSettings:       1,
  gaiaServerRecord:   1,
  gaiaFleetDocument:  3,
  gaiaCommand:        2,
  gaiaCommandAnswer:  3,
  gaiaFrameSession:   1,
  gaiaHealth:         1,
  gaiaProgramAnswer:  1,
  boundaryRecording:  1,
} as const;

/**
 * The older numbers of a contract that Gaia still reads, each migrated on its ingestion to the current number's shape. A control number is
 * one Gaia still sends: every command but those the later numbers add.
 */
export const OLDER_CONTRACT_VERSIONS_READ: { readonly forgeMonitor: readonly number[]; readonly forgeControl: readonly number[] } = {
  forgeMonitor: [1, 2],
  forgeControl: [1],
};

/** The first number of a forge contract that carries Flint's brain (G3): a forge at an older control contract is sent neither brain command. */
export const FLINT_BRAIN_CONTRACT_VERSIONS = { forgeControl: 2 } as const;
