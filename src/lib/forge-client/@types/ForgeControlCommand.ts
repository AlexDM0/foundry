/** The commands of the forge's control contract 1 (F7): the seven kinds a monitor may send to `POST /api/commands`, as the forge spells them. */

/** `wind-down` lets each job finish its turn; `stop` ends it now. */
export type ForgeJobStopMode = 'stop' | 'wind-down';

export type ForgeControlCommand =
  | { readonly kind: 'overseer-pause' }
  | { readonly kind: 'overseer-resume' }
  | { readonly kind: 'overseer-stop'; readonly now: boolean }
  | { readonly kind: 'overseer-restart'; readonly now: boolean }
  | { readonly kind: 'concurrency-set'; readonly limit: number }
  | { readonly kind: 'job-stop-all'; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'machine-agent-limit-set'; readonly limit: number };
