/**
 * The versions of the Overseer API's documents, taken from `forge-contracts`. `GET /api/identity` carries `IDENTITY_VERSION` and lists
 * `SERVED_CONTRACT_VERSIONS` as `contracts`; a contract this program does not serve has no entry. A change of shape in a contract raises
 * its number in the package in the same change. It imports only the packages, so the Bridge's project compiles it.
 */
import type { ForgeControlCommand }   from 'forge-contracts/ForgeControlCommand';
import type { ServedContractName }    from 'forge-contracts/IdentityDocument';
import { OVERSEER_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';

export const IDENTITY_VERSION = OVERSEER_CONTRACT_VERSIONS.identity;

export const SERVED_CONTRACT_VERSIONS = {
  summary: OVERSEER_CONTRACT_VERSIONS.summary,
  monitor: OVERSEER_CONTRACT_VERSIONS.monitor,
  control: OVERSEER_CONTRACT_VERSIONS.control,
  embed:   OVERSEER_CONTRACT_VERSIONS.embed,
} as const satisfies Readonly<Record<ServedContractName, number>>;

export type ServedContract = keyof typeof SERVED_CONTRACT_VERSIONS;

/**
 * The kinds of the control contract: what a monitor may send to `POST /api/commands`, each body and answer pinned by
 * `cli/overseer/routes/CommandRoute.controlContract.spec.ts` against the package's `ForgeControlCommand`. Every other kind may change
 * without raising the system version.
 */
export const CONTROL_CONTRACT_KINDS = [
  'overseer-pause',
  'overseer-resume',
  'overseer-stop',
  'overseer-restart',
  'concurrency-set',
  'job-stop-all',
  'machine-agent-limit-set',
  'flint-brain-start',
  'flint-brain-stop',
] as const satisfies readonly ForgeControlCommand['kind'][];
