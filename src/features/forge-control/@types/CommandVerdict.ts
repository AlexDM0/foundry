/**
 * How forge-control ended one command. A forge's refusal carries its code and its sentence unchanged; Gaia's own refusals carry a code
 * only, which the page words. Only the page server maps a verdict to a status and an answer.
 */

/**
 * `command-in-flight`: a command to the same forge is on its way. `forge-not-registered`: the registry names no such forge.
 * `program-not-found`: neither the registry nor the settings name a forge program that runs. `repository-missing`: the forge's root is
 * gone. `token-unreadable`: the Overseer's token file cannot be read. `token-rejected`: the Overseer refused the token.
 */
export type GaiaRefusal =
  | 'command-in-flight'
  | 'forge-not-registered'
  | 'program-not-found'
  | 'repository-missing'
  | 'token-unreadable'
  | 'token-rejected';

/**
 * `unreachable`: the forge gave no answer in time. `not-supported`: the forge speaks a control contract Gaia does not know, or its
 * program answered in a way Gaia does not understand.
 */
export type CommandVerdict =
  | { readonly verdict: 'done' }
  | { readonly verdict: 'nothing-to-do' }
  | { readonly verdict: 'refused'; readonly refusedBy: 'forge'; readonly refusal: string | null; readonly text: string | null }
  | { readonly verdict: 'refused'; readonly refusedBy: 'gaia'; readonly refusal: GaiaRefusal }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'not-supported' };
