/**
 * A refusal as forge serves it, from forge 1.21: on a refused command, `POST /api/v2/commands` answers 409
 * `{controlVersion: 2, refusal: <code>, fields, text: <sentence>}`, and 400 and 423 carry `fields: {}`. The sentence is the one forge's
 * command line prints, so a client shows it as it is.
 */

export type ForgeJsonValue = string | number | boolean | null | readonly ForgeJsonValue[] | { readonly [field: string]: ForgeJsonValue };

/** A refusal as forge gives it: its reason code, the facts it names, and the sentence its command line prints. */
export interface ForgeRefusalDocument {
  readonly code:     string;
  readonly fields:   Readonly<Record<string, ForgeJsonValue>>;
  readonly sentence: string;
}
