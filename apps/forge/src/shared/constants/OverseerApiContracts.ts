/**
 * The versions of the Overseer API's documents, taken from `forge-contracts`. `GET /api/identity` carries `IDENTITY_VERSION` and lists
 * `SERVED_CONTRACT_VERSIONS` as `contracts`; a contract this program does not serve has no entry. A change of shape in a contract raises
 * its number in the package in the same change.
 */
import type { ForgeBoardCommand }     from 'forge-contracts/BoardCommand';
import type { ForgeControlCommand }   from 'forge-contracts/ForgeControlCommand';
import type { ServedContractName }    from 'forge-contracts/IdentityDocument';
import { OVERSEER_CONTRACT_VERSIONS } from 'forge-contracts/OverseerContractVersions';

export const IDENTITY_VERSION = OVERSEER_CONTRACT_VERSIONS.identity;

export const SERVED_CONTRACT_VERSIONS = {
  summary: OVERSEER_CONTRACT_VERSIONS.summary,
  monitor: OVERSEER_CONTRACT_VERSIONS.monitor,
  control: OVERSEER_CONTRACT_VERSIONS.control,
} as const satisfies Readonly<Record<ServedContractName, number>>;

export type ServedContract = keyof typeof SERVED_CONTRACT_VERSIONS;

/**
 * The kinds of the control contract: what a monitor may send to `POST /api/commands`, each body and answer pinned by
 * `cli/overseer/routes/CommandRoute.controlContract.spec.ts` against the package's `ForgeControlCommand`. A kind in neither this list nor
 * `BOARD_COMMAND_CONTRACT_KINDS` may change without raising the system version.
 */
export const CONTROL_CONTRACT_KINDS = [
  'overseer-pause',
  'overseer-resume',
  'interrupted-work-resume',
  'overseer-stop',
  'overseer-restart',
  'talos-restart',
  'concurrency-set',
  'job-stop-all',
  'machine-agent-limit-set',
] as const satisfies readonly ForgeControlCommand['kind'][];

/**
 * The board's kinds of the contract, under the same control version: what a view sends to `POST /api/commands`, each body
 * the package's `ForgeBoardCommand`, read and mapped into forge's command by `src/adapters/board-commands/`, and pinned by
 * `cli/overseer/routes/CommandRoute.boardContract.spec.ts`.
 */
export const BOARD_COMMAND_CONTRACT_KINDS = [
  'chart-range-set',
  'decision-answer',
  'gate-profile-start',
  'gate-profile-stop',
  'intake-close',
  'intake-start',
  'job-fresh',
  'job-message',
  'job-stop',
  'merge-accept',
  'merge-update',
  'pipeline-agent-advise',
  'pipeline-apply',
  'pipeline-apply-cancel',
  'pipeline-assistant-set',
  'pipeline-check',
  'pipeline-constitution-edit',
  'pipeline-draft-discard',
  'pipeline-draft-edit',
  'pipeline-draft-undo',
  'pipeline-setup-answer',
  'pipeline-setup-billing',
  'pipeline-setup-resume',
  'pipeline-setup-start',
  'pipeline-setup-start-over',
  'pipeline-setup-step',
  'pipeline-update-start',
  'ticket-deliver-by-hand',
  'ticket-hold',
  'ticket-network',
  'ticket-park',
  'ticket-priority',
  'ticket-ready',
  'ticket-unhold',
  'tracker-clear',
] as const satisfies readonly ForgeBoardCommand['kind'][];
