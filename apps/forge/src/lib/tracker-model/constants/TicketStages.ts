import type { TicketStageName } from '../@types/Task.ts';

export const TICKET_STAGE_NAMES = ['build', 'package-build', 'package-review', 'adapt', 'review'] as const satisfies readonly TicketStageName[];

/** A job's `stage` is its stage's number in the crossing table: 1 for `build` to 5 for `review`. */
export const TICKET_STAGE_NUMBERS: Readonly<Record<TicketStageName, number>> = {
  'build':          1,
  'package-build':  2,
  'package-review': 3,
  'adapt':          4,
  'review':         5,
};

/**
 * Read as "to reach the key, the ticket has to be in one of these stages"; no stage holds its own key. A move from `adapt` or `review`
 * into `package-build` is a package return, and a refused package change or one turned into a need goes back to `build` from any later stage.
 */
export const LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE: Readonly<Record<TicketStageName, readonly TicketStageName[]>> = {
  'build':          ['package-build', 'package-review', 'adapt', 'review'],
  'package-build':  ['build', 'package-review', 'adapt', 'review'],
  'package-review': ['package-build'],
  'adapt':          ['package-review', 'review'],
  'review':         ['package-review', 'adapt'],
};

/** The stages a package return starts from: the home builder found the sealed package change lacking, or a package gate went red at landing. */
export const PACKAGE_RETURN_SOURCE_STAGES: readonly TicketStageName[] = ['adapt', 'review'];
