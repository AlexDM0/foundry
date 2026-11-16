/** Test-only: reads the design-system package's failed action, kept folded, by the words and handlers Gaia's refusal hands it. */
import { FailedAction } from 'design-system/FailedAction';

import { type HostElement, ReactElementTree, type RenderedNode } from './ReactElementTree.ts';

export const FailedActions = {
  /** Every failed action, at any depth, in document order. */
  failedActionsIn(nodes: readonly RenderedNode[]): HostElement[] {
    return ReactElementTree.hostElementsIn(nodes, ReactElementTree.withComponent(FailedAction));
  },

  /** The one failed action; none or several fail the spec. */
  onlyFailedActionIn(nodes: readonly RenderedNode[]): HostElement {
    return ReactElementTree.onlyOfComponent(nodes, FailedAction);
  },

  /** The lead naming what was refused and by whom, the code and the sentence, as Gaia hands them on. */
  wordsOf(failedAction: HostElement): readonly [unknown, unknown, unknown] {
    return [failedAction.props['lead'], failedAction.props['code'], failedAction.props['sentence']];
  },
} as const;
