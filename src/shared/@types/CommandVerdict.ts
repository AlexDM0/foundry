/**
 * How Gaia ended one command. A forge's refusal carries its code and its sentence unchanged; Gaia's own refusals carry a code only, which
 * the page words. Only the page server maps a verdict to a status, and only the page contract's mapper to an answer.
 */

/**
 * `command-in-flight`: a command to the same forge, the same repository or the machine limit is on its way. `forge-not-registered`: the
 * registry names no such forge. `no-forge-registered`: the machine limit has no forge to carry it. `program-not-found`: neither the
 * registry nor the settings name a forge program that runs. `repository-missing`: the forge's root is gone. `token-unreadable`: the
 * Overseer's token file cannot be read. `token-rejected`: the Overseer refused the token. `settings-newer-version`: the settings file is
 * newer than this Gaia and is kept as it is. `settings-unwritable`: the settings file cannot be written. `path-chooser-failed`: the chooser
 * ended without a choice and without being cancelled.
 */
export type GaiaRefusal =
  | 'command-in-flight'
  | 'forge-not-registered'
  | 'no-forge-registered'
  | 'program-not-found'
  | 'repository-missing'
  | 'token-unreadable'
  | 'token-rejected'
  | 'settings-newer-version'
  | 'settings-unwritable'
  | 'path-chooser-failed';

/**
 * `path-chosen`: a `path-choose` ended with User's choice, which the answer carries. `unreachable`: the forge gave no answer in time.
 * `not-supported`: the forge speaks a control contract Gaia does not know, its program answered in a way Gaia does not understand, or this
 * machine has no chooser.
 */
export type CommandVerdict =
  | { readonly verdict: 'done' }
  | { readonly verdict: 'path-chosen'; readonly path: string }
  | { readonly verdict: 'nothing-to-do' }
  | { readonly verdict: 'refused'; readonly refusedBy: 'forge'; readonly refusal: string | null; readonly text: string | null }
  | { readonly verdict: 'refused'; readonly refusedBy: 'gaia'; readonly refusal: GaiaRefusal }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'not-supported' };
