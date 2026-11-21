/**
 * How Gaia ended one command. A forge's refusal carries its code and its sentence unchanged, and the page contract's mapper rewords a
 * sentence that names a command; Gaia's own refusals carry a code only, which the page words. Only the page server maps a verdict to a
 * status, and only the page contract's mapper to an answer.
 */

/**
 * Why the registry names no forge to carry a command or to open a frame session in, though the forge watch may still show some: Gaia
 * cannot read it, or it is newer than this Gaia.
 */
export type RegistryRefusal = 'registry-unreadable' | 'registry-newer-version';

/**
 * `command-in-flight`: a command to the same forge, the same repository or the machine limit is on its way. `forge-not-registered`: the
 * registry Gaia read names no such forge. `no-forge-registered`: the machine limit has no forge to carry it. `program-not-found`: neither
 * the registry nor the settings name a forge program that runs. `repository-missing`: the forge's root is gone. `token-unreadable`:
 * Hephaestus's token file cannot be read. `token-rejected`: Hephaestus refused the token. `settings-newer-version`: the settings file is
 * newer than this Gaia and is kept as it is. `settings-unwritable`: the settings file cannot be written. `path-chooser-failed`: the chooser
 * ended without a choice and without being cancelled.
 */
export type GaiaRefusal =
  | 'command-in-flight'
  | 'forge-not-registered'
  | RegistryRefusal
  | 'no-forge-registered'
  | 'program-not-found'
  | 'repository-missing'
  | 'token-unreadable'
  | 'token-rejected'
  | 'settings-newer-version'
  | 'settings-unwritable'
  | 'path-chooser-failed';

/**
 * How one forge took the fleet's resume of the jobs a network outage stopped: `resumed` those it held, the count Gaia last read of it;
 * `nothing-to-do`, it held none; `refused`, with the forge's sentence; `not-reached`, its API did not answer or Gaia could not send it.
 */
export type OutageResumeOutcome = 'resumed' | 'nothing-to-do' | 'refused' | 'not-reached';

export interface OutageResumeForgeAnswer {
  readonly trackerId:    string;
  readonly outcome:      OutageResumeOutcome;
  /** Zero but for `resumed`. */
  readonly resumedCount: number;
  /** The forge's sentence of a `refused`, unchanged; `null` otherwise. */
  readonly refusalText:  string | null;
}

/**
 * `path-chosen`: a `path-choose` ended with User's choice, which the answer carries. `restart-pending`: a `forge-update` was done, but the
 * live Hephaestus did not take the Baton pass and runs the old code until it restarts. `unreachable`: the forge gave no answer in time.
 * `not-supported`: the forge speaks a control contract Gaia does not know, its program answered in a way Gaia does not understand, or this
 * machine has no chooser. `outage-resume-answered`: the fleet's resume of the jobs a network outage stopped, with one answer per forge.
 */
export type CommandVerdict =
  | { readonly verdict: 'done' }
  | { readonly verdict: 'outage-resume-answered'; readonly forges: readonly OutageResumeForgeAnswer[] }
  | { readonly verdict: 'path-chosen'; readonly path: string }
  | { readonly verdict: 'nothing-to-do' }
  | { readonly verdict: 'restart-pending' }
  | { readonly verdict: 'refused'; readonly refusedBy: 'forge'; readonly refusal: string | null; readonly text: string | null }
  | { readonly verdict: 'refused'; readonly refusedBy: 'gaia'; readonly refusal: GaiaRefusal }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'not-supported' };
