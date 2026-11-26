/** The forced stops of a lost child's tree that were refused, and the tree's process ids at the last one, its root first. */
export interface ForcedStopRefusals {
  refusals:       number;
  treeProcessIds: number[];
}
