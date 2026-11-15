/**
 * Which items a view marks as changed between two consecutive boards: each view keys its items and gives each a signature, and an item is
 * marked when it is new or its signature moved. The first board marks nothing, since there is nothing it changed from.
 */

const NOTHING_CHANGED: ReadonlySet<string> = new Set();

/** A display state, with the review round when it has one, so a second review pass reads as a move too. */
function signatureOf(displayState: string, reviewRound: number | null): string {
  return reviewRound === null ? displayState : `${displayState} round ${reviewRound}`;
}

/** Only the keys the current board holds are answered: an item that went has nothing on screen to mark. */
function changedKeysBetween(previousSignatures: ReadonlyMap<string, string> | null, currentSignatures: ReadonlyMap<string, string>): ReadonlySet<string> {
  if (previousSignatures === null) return NOTHING_CHANGED;
  const changed = new Set<string>();
  for (const [key, signature] of currentSignatures) {
    if (previousSignatures.get(key) !== signature) changed.add(key);
  }
  return changed.size === 0 ? NOTHING_CHANGED : changed;
}

/** The marks left once one item's highlight has played. */
function withoutKey(changedKeys: ReadonlySet<string>, shownKey: string): ReadonlySet<string> {
  if (!changedKeys.has(shownKey)) return changedKeys;
  const remaining = new Set(changedKeys);
  remaining.delete(shownKey);
  return remaining;
}

export const ChangeHighlightUtil = Object.freeze({
  signatureOf, changedKeysBetween, withoutKey, NOTHING_CHANGED
});
