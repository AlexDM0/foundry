/**
 * What an event of a forge's board stream tells Gaia. The forge's events carry its internal board state, which Gaia never reads, so every
 * event is a change signal: `board-changed` asks for the board document anew (`ForgeClient.boardOf`), and a part event names the part
 * that changed, which a `board-changed` of the same pass always follows.
 */
export type BoardPartName = 'job' | 'decision' | 'incident' | 'overseer' | 'usage' | 'profile' | 'pipeline';

export type BoardEvent =
  | { readonly kind: 'board-changed' }
  | { readonly kind: 'part-changed'; readonly part: BoardPartName };
