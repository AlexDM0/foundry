/**
 * Where a ticket that is still being written stands, for a view that lists what waits on User: its stage, what of it waits on User, the
 * agent writing it, and when the wait began, which only orders what a view shows.
 */

/** The spec-then-plan route's stages, then a ticket that waits for its review on either route. */
export type DraftStage = 'spec' | 'spec-review' | 'plan' | 'plan-review' | 'ticket-review';

/** `answer`: a question of the agent is open; `proposal`: an edit of the agent waits for Apply; `approval`: the stage's document or ticket. */
export type DraftWait = 'answer' | 'proposal' | 'approval';

export interface DraftProgress {
  stage:        DraftStage;
  /** `null` while nothing of the stage waits on User. */
  waitsOnUser:  DraftWait | null;
  /** The live document agent of the stage's document; `null` while none is on the board. */
  agentJobId:   string | null;
  /** When the oldest thing that waits on User began to wait; `null` with `waitsOnUser`. */
  waitingSince: string | null;
}
