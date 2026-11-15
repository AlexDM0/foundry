/**
 * The commands of the forge's control contract (F7, G3) a monitor may send to `POST /api/commands`, as the forge spells them: contract 1's
 * seven kinds, and the two of Flint's brain that contract 2 adds. The body carries no version: the identity's `contracts.control` names
 * the major the forge reads, and a sender sends a forge only the kinds its major carries.
 */

/** `wind-down` lets each job finish its turn; `stop` ends it now. */
export type ForgeJobStopMode = 'stop' | 'wind-down';

export type ForgeControlCommandOfVersionOne =
  | { readonly kind: 'overseer-pause' }
  | { readonly kind: 'overseer-resume' }
  | { readonly kind: 'overseer-stop'; readonly now: boolean }
  | { readonly kind: 'overseer-restart'; readonly now: boolean }
  | { readonly kind: 'concurrency-set'; readonly limit: number }
  | { readonly kind: 'job-stop-all'; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'machine-agent-limit-set'; readonly limit: number };

export type ForgeControlCommand =
  | ForgeControlCommandOfVersionOne
  | { readonly kind: 'flint-brain-start' }
  | { readonly kind: 'flint-brain-stop' };
