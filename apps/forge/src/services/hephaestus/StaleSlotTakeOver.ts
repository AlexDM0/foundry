/**
 * How the agent slots and the gate run slots free a stale slot, one taker at a time: the taker first creates `<slot>.taking` exclusively,
 * then removes the slot only while it still holds the text it was judged by, so a slot another claimer created since is never removed. A
 * taking marker is a holding by its taker's process like a slot, so one whose taker is gone, or that cannot be read, is taken over too.
 */
import type { FileReplace } from '../../lib/atomic-file/FileReplace.ts';

export const TAKING_MARKER_SUFFIX = '.taking';

/** A taking marker as it was read: its text, and whether the taker it names still runs; one that cannot be read names none. */
export interface TakingMarker {
  storedText:  string;
  takerIsLive: boolean;
}

/** What freeing a stale slot needs of its slot kind. */
export interface SlotTaker {
  fileReplace:   FileReplace;
  /** The text the file holds now; `null` when it is absent or its bytes cannot be read. */
  storedTextAt:  (path: string) => string | null;
  /** Creates the taking marker naming this taker, exclusively and whole: true only when this call created it. */
  createdMarker: (markerPath: string) => boolean;
  /** `null` when the marker is absent or its bytes cannot be read, which leaves it to its taker. */
  markerAt:      (markerPath: string) => TakingMarker | null;
}

/** A file something else holds, or one already gone, is not removed by this call. */
function removed(path: string, fileReplace: FileReplace): boolean {
  try {
    return fileReplace.removeHeldFile(path).verdict === 'moved';
  } catch {
    return false;
  }
}

/** A marker whose taker is gone is removed only while it still holds the text it was judged by, then created again for this taker. */
function takingMarkerClaimed(markerPath: string, taker: SlotTaker): boolean {
  if (taker.createdMarker(markerPath)) return true;
  const marker = taker.markerAt(markerPath);
  if (marker === null || marker.takerIsLive) return false;
  if (taker.storedTextAt(markerPath) !== marker.storedText || !removed(markerPath, taker.fileReplace)) return false;
  return taker.createdMarker(markerPath);
}

/** True when this taker removed the slot, still holding `judgedText`; false leaves it to whoever else is taking it or holds it. */
function staleSlotFreed(slotPath: string, judgedText: string, taker: SlotTaker): boolean {
  const markerPath = `${slotPath}${TAKING_MARKER_SUFFIX}`;
  if (!takingMarkerClaimed(markerPath, taker)) return false;
  try {
    return taker.storedTextAt(slotPath) === judgedText && removed(slotPath, taker.fileReplace);
  } finally {
    removed(markerPath, taker.fileReplace);
  }
}

export const StaleSlotTakeOver = Object.freeze({ staleSlotFreed });
