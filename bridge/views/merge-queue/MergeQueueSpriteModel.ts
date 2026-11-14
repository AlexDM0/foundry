/**
 * What the merge-queue habitat cues between two payloads (`09-bridge-wiring.md`, "New habitats", `merge-queue`), each row once, in the
 * order of the table, from the targets the view shows: a target whose Airlock was free or that was not shown gets a holder; a candidate the
 * previous payload predicted otherwise against the same target, in its order or waiting for merge, is now conflicting; a ticket joins a
 * target's order.
 */
import type { SpriteCue }        from '../../../flint/SpriteHabitat.ts';
import type { MergeQueueTarget } from './MergeQueueModel.ts';
import { MERGE_QUEUE_CUES }      from './MergeQueueSpriteHabitat.ts';

/** The fields of a target the habitat reads; the view's targets satisfy it unchanged. */
export type CuedMergeTarget = Pick<MergeQueueTarget, 'target' | 'phase' | 'lines' | 'waitingLines'>;

const CONFLICTING = 'conflicting';

function forecastsOf(target: CuedMergeTarget | undefined): ReadonlyMap<string, string> {
  return new Map([...target?.lines ?? [], ...target?.waitingLines ?? []].map((line) => [line.ticketId, line.forecast]));
}

function cuesBetween(previous: readonly CuedMergeTarget[], next: readonly CuedMergeTarget[]): readonly SpriteCue[] {
  const previousByTarget = new Map(previous.map((target) => [target.target, target]));
  const changed = (change: (before: CuedMergeTarget | undefined, after: CuedMergeTarget) => boolean): boolean => (
    next.some((target) => change(previousByTarget.get(target.target), target))
  );
  const happenings: readonly (readonly [SpriteCue, boolean])[] = [
    [MERGE_QUEUE_CUES.AIRLOCK_TAKEN, changed((before, after) => after.phase !== null && (before?.phase ?? null) === null)],
    [MERGE_QUEUE_CUES.CONFLICT_PREDICTED, changed((before, after) => {
      const previousForecasts = forecastsOf(before);
      return [...forecastsOf(after)].some(([ticketId, forecast]) => {
        const previousForecast = previousForecasts.get(ticketId);
        return forecast === CONFLICTING && previousForecast !== undefined && previousForecast !== CONFLICTING;
      });
    })],
    [MERGE_QUEUE_CUES.TICKET_QUEUED, changed((before, after) => after.lines.some((line) => !(before?.lines ?? []).some((earlier) => earlier.ticketId === line.ticketId)))],
  ];
  return happenings.flatMap(([cueName, happened]) => (happened ? [cueName] : []));
}

export const MergeQueueSpriteModel = Object.freeze({ cuesBetween });
