/**
 * The version of each contract the Overseer's API serves to a monitor, named by `GET /api/identity` as `contracts`, one entry per
 * contract. A change of a contract's shape raises its number in the same change. It imports nothing, so the Bridge's project compiles it.
 */
export const IDENTITY_VERSION = 1;

export const OVERSEER_CONTRACT_VERSIONS = { embed: 1, } as const;

export type OverseerContractVersions = typeof OVERSEER_CONTRACT_VERSIONS;
