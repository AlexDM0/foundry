/** The version Gaia knows of every versioned contract it reads, writes or serves; a reading at another number never reaches a mapper. */
export const CONTRACT_VERSIONS = {
  forgeRegistry:      1,
  forgeIdentity:      1,
  forgeBoardSummary:  1,
  forgeMonitor:       1,
  forgeControl:       1,
  forgeEmbedChannel:  1,
  forgeProgramAnswer: 1,
  forgeMachineLimits: 1,
  gaiaSettings:       1,
  gaiaServerRecord:   1,
  gaiaFleetDocument:  1,
  gaiaCommand:        1,
  gaiaCommandAnswer:  1,
  gaiaHealth:         1,
  gaiaProgramAnswer:  1,
} as const;
