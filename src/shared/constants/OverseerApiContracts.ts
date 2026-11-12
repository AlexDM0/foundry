/**
 * The versions of the Overseer API's documents. `GET /api/identity` carries `IDENTITY_VERSION` and lists `SERVED_CONTRACT_VERSIONS` as
 * `contracts`; a contract this program does not serve has no entry. A change of shape in a contract raises its number in the same change.
 */
export const IDENTITY_VERSION = 1;

export const SERVED_CONTRACT_VERSIONS = {
  summary: 1,
  monitor: 1,
} as const;

export type ServedContract = keyof typeof SERVED_CONTRACT_VERSIONS;
