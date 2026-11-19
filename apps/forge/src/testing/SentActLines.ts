/**
 * The input and stop frames a spec's recording Talos answered, each as the line of its act: what a planted socket once received. A frame
 * Talos applies as it stands reads as the client entry Talos would log for it; a quit at its turn end reads as itself. Test-only.
 */
import { clientEntryLineOf }      from '../lib/talos/TalosFrames.ts';
import type { TalosFrameRequest } from '../services/overseer/TalosConnection.ts';

/** Each input and stop frame as its act's line; a launch, a renewal and the rest are no act. */
export function sentActLinesOf(frames: readonly TalosFrameRequest[]): string[] {
  return frames.flatMap((frame) => {
    if (frame.kind === 'input') return [frame.input.act === 'quit-at-turn-end' ? JSON.stringify(frame.input) : clientEntryLineOf(frame.input)];
    if (frame.kind === 'stop') return [clientEntryLineOf({ act: 'stop', graceMilliseconds: frame.graceMilliseconds })];
    return [];
  });
}
