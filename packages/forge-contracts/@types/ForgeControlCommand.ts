/**
 * The commands of the forge's control contract a monitor may send to `POST /api/commands`, as the forge spells them. The body
 * carries no version: the forge's system version names the kinds it reads, the resume of interrupted work from 1.20 and the
 * clean restart of Talos from 1.23.
 */

/** `wind-down` lets each job finish its turn; `stop` ends it now. */
export type ForgeJobStopMode = 'stop' | 'wind-down';

/**
 * What a resume of interrupted work names: one job, one ticket as it is written, every job that waits for an instruction, or every job
 * that ended on a network outage. From forge 1.20.
 */
export type ForgeResumeTarget =
  | { readonly jobId: string }
  | { readonly ticketReference: string }
  | 'all'
  | 'network-outage';

export type ForgeControlCommand =
  | { readonly kind: 'hephaestus-pause' }
  | { readonly kind: 'hephaestus-unpause' }
  | { readonly kind: 'interrupted-work-resume'; readonly target: ForgeResumeTarget }
  | { readonly kind: 'hephaestus-stop'; readonly now: boolean }
  | { readonly kind: 'hephaestus-restart'; readonly now: boolean }
  /** Runtime only: Talos quits cleanly and the right one starts; its paused agents resume by themselves. From forge 1.23. */
  | { readonly kind: 'talos-restart' }
  | { readonly kind: 'concurrency-set'; readonly limit: number }
  | { readonly kind: 'job-stop-all'; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'machine-agent-limit-set'; readonly limit: number }
  /** This machine's program of an agent vendor, for every forge that follows it, kept only once it runs. From forge 4.1. */
  | { readonly kind: 'machine-agent-program-set'; readonly vendor: string; readonly programPath: string };
