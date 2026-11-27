/**
 * What lies ahead of an open ticket, as Hephaestus serves it: its lifecycle steps from the one under way, or the next one, to its landing,
 * and the tickets that wait on it. Values only; a client words them.
 */

/**
 * A step of the ticket's journey. A `jobId` names the live job doing the step, `null` while none is (a build's `null`: a builder takes it
 * when a launch slot frees). A `target` is `null` when the reading carries no merge targets.
 */
export type TicketForecastStep =
  | { kind: 'build'; attempt: number; jobId: string | null }
  /** `gateNames`: the build phase's gates in run order, which judge a build. */
  | { kind: 'customs-and-gates'; gateNames: string[]; jobId: string | null }
  | { kind: 'review'; round: number; jobId: string | null }
  | { kind: 'merge-approval'; target: string | null }
  | { kind: 'land'; target: string | null }
  | { kind: 'integrate'; target: string | null; group: string };

/** An open ticket whose dependencies name the forecast's ticket, with the other dependencies it still waits on. */
export interface TicketDependent {
  ticketId:                string;
  stillWaitingOnTicketIds: string[];
}

export interface TicketForecast {
  ticketId:         string;
  /** From the step under way, or the next one, to the landing. */
  steps:            TicketForecastStep[];
  /** `0` while the first step is under way (a live job on the ticket); `null` while nothing runs on it. */
  currentStepIndex: number | null;
  dependents:       TicketDependent[];
}
