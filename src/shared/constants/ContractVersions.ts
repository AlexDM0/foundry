/**
 * The current version Gaia knows of every versioned contract it reads, writes or serves. A reading at another number never reaches a mapper,
 * except at a number `OLDER_CONTRACT_VERSIONS_READ` names, which its ingestion migrates to the current one.
 */
export const CONTRACT_VERSIONS = {
  forgeRegistry:      1,
  forgeIdentity:      1,
  forgeBoardSummary:  1,
  forgeMonitor:       2,
  forgeControl:       1,
  forgeEmbedChannel:  1,
  forgeProgramAnswer: 1,
  forgeMachineLimits: 1,
  gaiaSettings:       1,
  gaiaServerRecord:   1,
  gaiaFleetDocument:  2,
  gaiaCommand:        1,
  gaiaCommandAnswer:  2,
  gaiaFrameSession:   1,
  gaiaHealth:         1,
  gaiaProgramAnswer:  1,
  boundaryRecording:  1,
} as const;

/** The older numbers of a contract that Gaia still reads, each migrated on its ingestion to the current number's shape. */
export const OLDER_CONTRACT_VERSIONS_READ: { readonly forgeMonitor: readonly number[] } = { forgeMonitor: [1] };

/**
 * The next number of a forge contract the forge has not shipped: Gaia holds answers at it authored from the forge's requirements, and
 * neither reads nor sends it, so a reading at it is still refused as newer. It moves into `CONTRACT_VERSIONS` when its ingestion learns it.
 */
export const UPCOMING_CONTRACT_VERSIONS: { readonly forgeMonitor: number; readonly forgeControl: number } = { forgeMonitor: 3, forgeControl: 2 };
