/**
 * The one version Gaia knows of each contract its server serves its own clients, the page and the launcher. The page reads its versions from here
 * only, so this file imports nothing and the page never reaches the forge's contracts; the forge's contracts and Gaia's stored files stay in
 * `ContractVersions.ts`.
 */
export const PAGE_CONTRACT_VERSIONS = {
  gaiaFleetDocument:       12,
  gaiaCommand:             5,
  gaiaCommandAnswer:       3,
  gaiaHealth:              1,
  gaiaBoard:               3,
  gaiaBoardCommand:        3,
  gaiaBoardStream:         2,
  gaiaTicketDocuments:     1,
  gaiaDiagramFrame:        1,
  gaiaBoardCommandAnswer:  1,
  gaiaPictureUploadAnswer: 1,
  gaiaCrashLog:            1,
} as const satisfies Readonly<Record<string, number>>;
