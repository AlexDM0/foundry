import type { Concurrency }                                                   from '../@types/Concurrency.ts';
import type { Job }                                                           from '../@types/Job.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS, DEFAULT_CONCURRENCY_LIMIT_AGENTS } from '../constants/ConcurrencyLimits.ts';
import { LaunchSlotUtil }                                                     from './LaunchSlotUtil.ts';

function agentsInFlightOf(jobs: readonly Pick<Job, 'id' | 'kind' | 'state'>[]): number {
  return LaunchSlotUtil.slotJobIdsOf(jobs).length;
}

/** A stored limit above the ceiling reads as the ceiling, and a tracker that never stored one reads the default. */
function concurrencyOf(jobs: readonly Pick<Job, 'id' | 'kind' | 'state'>[], storedLimit: number | undefined): Concurrency {
  const limit          = Math.min(storedLimit ?? DEFAULT_CONCURRENCY_LIMIT_AGENTS, CONCURRENCY_LIMIT_CEILING_AGENTS);
  const agentsInFlight = agentsInFlightOf(jobs);
  return { limit, agentsInFlight, freeSlots: Math.max(0, limit - agentsInFlight) };
}

export const ConcurrencyUtil = { agentsInFlightOf, concurrencyOf } as const;
