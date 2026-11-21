/**
 * The one version Gaia knows of each contract its own server serves its own clients, the page above all and the launcher, which reads
 * health: each document's integer key. The page reads its versions from here only, so this file imports nothing and the page never reaches
 * the forge's contracts through it. A new contract of Gaia's page, the board's included, takes its key here; the forge's contracts and the
 * files Gaia stores stay in `ContractVersions.ts`. `ContractVersionUtil` holds the reading rule.
 */
export const PAGE_CONTRACT_VERSIONS = {
  gaiaFleetDocument:       9,
  gaiaCommand:             4,
  gaiaCommandAnswer:       3,
  gaiaHealth:              1,
  gaiaBoard:               1,
  gaiaBoardCommand:        1,
  gaiaBoardStream:         1,
  gaiaBoardCommandAnswer:  1,
  gaiaPictureUploadAnswer: 1,
  gaiaCrashLog:            1,
} as const satisfies Readonly<Record<string, number>>;
