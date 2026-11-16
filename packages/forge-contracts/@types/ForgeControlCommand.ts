/**
 * The commands of the forge's control contract (F7, G3) a monitor may send to `POST /api/commands`, as the forge spells them. The body
 * carries no version: the forge's system version names the kinds it reads, Flint's brain's two from 1.1.
 */

/** `wind-down` lets each job finish its turn; `stop` ends it now. */
export type ForgeJobStopMode = 'stop' | 'wind-down';

export type ForgeControlCommand =
  | { readonly kind: 'overseer-pause' }
  | { readonly kind: 'overseer-resume' }
  | { readonly kind: 'overseer-stop'; readonly now: boolean }
  | { readonly kind: 'overseer-restart'; readonly now: boolean }
  | { readonly kind: 'concurrency-set'; readonly limit: number }
  | { readonly kind: 'job-stop-all'; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'machine-agent-limit-set'; readonly limit: number }
  | { readonly kind: 'flint-brain-start' }
  | { readonly kind: 'flint-brain-stop' };
