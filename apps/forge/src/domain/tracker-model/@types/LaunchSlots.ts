/**
 * Which jobs hold the launch slots the concurrency figure counts, and the in-progress tickets no job works on, so a reader names them
 * without a rule of its own. Values only; a client words them.
 */
export interface LaunchSlots {
  limit:                         number;
  /** In launch order; always as many as `Concurrency.agentsInFlight`, since both count through `LaunchSlotUtil`. */
  slotJobIds:                    string[];
  /** In board order: an `in-progress` ticket that no live job's `ticketIds` names, such as one moved by hand. */
  inProgressTicketIdsWithoutJob: string[];
}
