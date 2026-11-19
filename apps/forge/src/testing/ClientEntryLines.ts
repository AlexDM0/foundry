/**
 * The frames a spec's recording Talos answered, as the client entries Talos would log for them: what a planted socket once received, read
 * through the port's own words. Test-only.
 */
import { clientEntryLineOf }      from '../lib/talos/TalosFrames.ts';
import type { TalosFrameRequest } from '../services/overseer/TalosConnection.ts';

/** Each input and stop frame as its client entry's line; a launch, a renewal and the rest are no entry. */
export function clientEntryLinesOf(frames: readonly TalosFrameRequest[]): string[] {
  return frames.flatMap((frame) => {
    if (frame.kind === 'input') return [clientEntryLineOf(frame.input)];
    if (frame.kind === 'stop') return [clientEntryLineOf({ act: 'stop', graceMilliseconds: frame.graceMilliseconds })];
    return [];
  });
}
