/**
 * The sentence of a refusal in an answer of Gaia's relay, which the board shows verbatim and never words itself: the forge's own sentence,
 * the one its command line prints, or Gaia's for a refusal of Gaia's; and a forge refusal's code and facts, for a view that offers a way
 * past it. `null` for a value that is no refusal of the page's contract.
 */

/** A forge's refusal as a view acts on it: its reason code and the facts it names, never worded by the board. */
export interface ForgeRefusalFacts {
  readonly code:   string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export function refusalTextOf(refusal: unknown): string | null {
  if (typeof refusal !== 'object' || refusal === null) return null;
  const { refusedBy, code, text } = refusal as Readonly<Record<string, unknown>>;
  if (refusedBy !== 'forge' && refusedBy !== 'gaia') return null;
  return typeof code === 'string' && typeof text === 'string' ? text : null;
}

/** The code and facts of a forge's refusal; `null` for Gaia's own refusal or a value that is no refusal. */
export function forgeRefusalFactsOf(refusal: unknown): ForgeRefusalFacts | null {
  if (typeof refusal !== 'object' || refusal === null) return null;
  const { refusedBy, code, fields } = refusal as Readonly<Record<string, unknown>>;
  if (refusedBy !== 'forge' || typeof code !== 'string' || typeof fields !== 'object' || fields === null) return null;
  return { code, fields: fields as Readonly<Record<string, unknown>> };
}
