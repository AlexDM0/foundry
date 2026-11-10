/** A display state's round dot, filled from the [data-state] row in `tokens.css`; its size comes from where it sits. It is decoration only. */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export function StateDot({ state }: { readonly state: DisplayState }) {
  return <span className="bridge-lane-dot" data-state={state} aria-hidden="true" />;
}
