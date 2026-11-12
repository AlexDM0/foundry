/**
 * The versions of the Overseer API's documents. `GET /api/identity` carries `IDENTITY_VERSION` and lists `SERVED_CONTRACT_VERSIONS` as
 * `contracts`; a contract this program does not serve has no entry. A change of shape in a contract raises its number in the same change.
 * It imports nothing, so the Bridge's project compiles it.
 */
export const IDENTITY_VERSION = 1;

export const SERVED_CONTRACT_VERSIONS = {
  summary: 1,
  monitor: 1,
  control: 1,
  embed:   1,
} as const;

export type ServedContract = keyof typeof SERVED_CONTRACT_VERSIONS;

/**
 * The kinds control contract 1 names: what a monitor may send to `POST /api/commands`, each body and answer pinned by
 * `cli/overseer/routes/CommandRoute.controlContract.spec.ts`. Every other kind may change without raising `contracts.control`.
 */
export const CONTROL_CONTRACT_KINDS = [
  'overseer-pause',
  'overseer-resume',
  'overseer-stop',
  'overseer-restart',
  'concurrency-set',
  'job-stop-all',
  'machine-agent-limit-set',
] as const;
