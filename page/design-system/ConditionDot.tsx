/**
 * A forge's condition as an 8 px dot: filled for a settled condition, a ring for one on its way or asleep, a dashed ring for one Gaia
 * cannot read. It is hidden from the accessibility tree: a dot is never the only sign, the row beside it says the word.
 */
export type DotCondition = 'live' | 'paused' | 'held' | 'starting' | 'dormant' | 'unreachable' | 'unreadable' | 'missing';

export function ConditionDot({ condition }: { readonly condition: DotCondition }) {
  return <span className="gaia-condition-dot" data-condition={condition} aria-hidden="true" />;
}
