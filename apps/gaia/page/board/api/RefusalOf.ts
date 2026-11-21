/**
 * The sentence of a refusal in an answer of Gaia's relay, which the board shows verbatim and never words itself: the forge's own sentence,
 * the one its command line prints, or Gaia's for a refusal of Gaia's. `null` for a value that is no refusal of the page's contract.
 */
export function refusalTextOf(refusal: unknown): string | null {
  if (typeof refusal !== 'object' || refusal === null) return null;
  const { refusedBy, code, text } = refusal as Readonly<Record<string, unknown>>;
  if (refusedBy !== 'forge' && refusedBy !== 'gaia') return null;
  return typeof code === 'string' && typeof text === 'string' ? text : null;
}
