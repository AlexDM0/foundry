/**
 * Flint's answer to the whole board, wherever it is: on each new reading it performs the first board occasion since the last reading
 * (`bridge/flint/BoardOccasionModel.ts`), given the habitat Flint lives in, and on each board it sets the sparks of `watcher-spark`. The
 * reading it starts with is no change, and an occasion while no Flint is made is not kept for a later one.
 */
import type { FlintHandle }  from 'flint';
import { useEffect, useRef } from 'react';

import { BoardOccasionModel, WATCHER_SPARK_ATTENDANT, type BoardReading } from './BoardOccasionModel.ts';

/** A `null` reading follows nothing: Flint performs no occasion and shows no sparks. */
export function useBoardOccasions(handle: FlintHandle | null, reading: BoardReading | null): void {
  const board = reading?.board ?? null;
  const connection = reading?.connection ?? null;
  const refusedCommandCount = reading?.refusedCommandCount ?? null;
  const lastReading = useRef(reading);

  useEffect(() => {
    const previous = lastReading.current;
    const next = connection === null || refusedCommandCount === null ? null : { board, connection, refusedCommandCount };
    lastReading.current = next === null ? null : BoardOccasionModel.keptReadingOf(previous, next);
    if (handle === null || previous === null || next === null) return;
    const [firstOccasion] = BoardOccasionModel.occasionsOf(previous, next, handle.livesIn());
    if (firstOccasion !== undefined) handle.perform(firstOccasion);
  }, [handle, board, connection, refusedCommandCount]);

  const followsTheBoard = reading !== null;
  useEffect(() => {
    if (handle !== null && followsTheBoard) handle.attend(WATCHER_SPARK_ATTENDANT, BoardOccasionModel.watcherSparkCountOf(board));
  }, [handle, followsTheBoard, board]);
}
