import type { BoardRoute } from './board/BoardRoute.ts';

/** One log entry a person cares about, worded by its forge. */
export type ActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

/** The entry's kind where Gaia shows it apart from its category: the run of a brain that ended (G2). */
export type ActivityKind = 'flint-brain';

export interface ActivityEntry {
  logPosition: number;
  at:          string;
  category:    ActivityCategory;
  text:        string;
  boardRoute:  BoardRoute | null;
  kind:        ActivityKind | null;
  /** The tokens the entry reports, as an ended brain's does; `null` for an entry that reports none. */
  tokens:      number | null;
}
