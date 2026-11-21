import type { BoardRoute } from './board/BoardRoute.ts';

/** One log entry a person cares about, worded by its forge. */
export type ActivityCategory = 'needs-user' | 'landed' | 'agent' | 'forge';

export interface ActivityEntry {
  logPosition: number;
  at:          string;
  category:    ActivityCategory;
  text:        string;
  boardRoute:  BoardRoute | null;
}
