/**
 * A Hephaestus poll at the interval the environment may set, with the tries scaled to it, so a shorter interval polls more
 * often but never gives up sooner than the limits in `src/shared/constants/HephaestusLimits.ts`.
 */
export interface HephaestusPollSchedule {
  tries:                number;
  intervalMilliseconds: number;
}

export function hephaestusPollScheduleOf(limits: HephaestusPollSchedule, intervalOverrideMilliseconds: number | undefined): HephaestusPollSchedule {
  if (intervalOverrideMilliseconds === undefined) return limits;
  const windowMilliseconds = limits.tries * limits.intervalMilliseconds;
  return { tries: Math.ceil(windowMilliseconds / intervalOverrideMilliseconds), intervalMilliseconds: intervalOverrideMilliseconds };
}
