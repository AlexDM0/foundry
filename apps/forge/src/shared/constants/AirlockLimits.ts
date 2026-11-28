/**
 * The counts an Airlock decides by: when a moving target parks, when a group refreshes, how much of a failed gate is
 * kept, and the budget of a fresh agent that replaces a ticket agent whose session could not be resumed.
 */
import { DISPATCH_PROTOCOL } from './DispatchProtocol.ts';

export const AIRLOCK_LIMITS = {
  TARGET_MOVED_MERGES_BEFORE_PARKING: 2,
  GROUP_REFRESH_AFTER_MAIN_COMMITS:   30,
  CHECK_OUTPUT_TAIL_LINES:            20,
  FRESH_BUILDER_API_CALL_BUDGET:      DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET,
  FRESH_REVIEWER_API_CALL_BUDGET:     DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET,
} as const;

export type AirlockLimits = { readonly [Name in keyof typeof AIRLOCK_LIMITS]: number };
