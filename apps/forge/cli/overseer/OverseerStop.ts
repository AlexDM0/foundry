/** What `oversee stop` and `stop` share: the stop of the live Overseer, closed in its place when it ended before finishing, and its report. */
import type { OverseerFiles }                                    from '../../src/services/overseer/OverseerFiles.ts';
import { type StoppedOverseerRequest, closeTheStoppedOverseer }  from './OverseerForeground.ts';
import { OverseerRemote, type OverseerEnding, type StopOutcome } from './OverseerRemote.ts';

export interface StopReport {
  entity:    { outcome: 'done' | 'nothing-to-do'; ending?: Exclude<OverseerEnding, 'clean'> };
  humanLine: string;
}

/**
 * An ending other than `clean` means the process is gone, by a dead Baton or a landed force, so what the Overseer left undone runs without it. A
 * newest Baton found dead is closed the same way, so a close that was refused before is repaired by the next stop.
 */
export async function stopAndCloseTheLiveOverseer(request: StoppedOverseerRequest, files: OverseerFiles, now: boolean): Promise<StopOutcome> {
  const stopped = await OverseerRemote.stopTheLiveOverseer(request.context.platformPorts, files, 'overseer-stop', now);
  const leftUnclosed = stopped.verdict === 'found-dead' || (stopped.verdict === 'stopped' && stopped.ending !== 'clean');
  if (leftUnclosed) await closeTheStoppedOverseer(request, files, stopped.generation);
  return stopped;
}

function stopTextOf(stopped: Exclude<StopOutcome, { verdict: 'was-down' }>, now: boolean): string {
  const overseerAtUrl = stopped.record === null ? 'The Overseer' : `The Overseer at ${stopped.record.url}`;
  const watcherNote   = now ? ' Process Watchers were not stopped: --now needs the API.' : '';
  const closing       = `this command recorded the stop in its place.${watcherNote}`;
  if (stopped.verdict === 'found-dead') return `${overseerAtUrl} had already ended before it finished its stop, so ${closing}`;
  const { ending, record } = stopped;
  if (ending === 'clean') return `Stopped the Overseer at ${record.url}.`;
  if (ending === 'forced') return `Ended the Overseer at ${record.url} by force: its API did not answer and it could not finish its stop, so ${closing}`;
  return `${overseerAtUrl} ended before it finished its stop, so ${closing}`;
}

export async function stopTheOverseer(request: StoppedOverseerRequest, files: OverseerFiles, now: boolean): Promise<StopReport> {
  const stopped = await stopAndCloseTheLiveOverseer(request, files, now);
  if (stopped.verdict === 'was-down') return { entity: { outcome: 'nothing-to-do' }, humanLine: 'No Overseer is live; nothing to stop.' };
  const ending = stopped.verdict === 'found-dead' ? 'unfinished' : stopped.ending;
  return { entity: ending === 'clean' ? { outcome: 'done' } : { outcome: 'done', ending }, humanLine: stopTextOf(stopped, now) };
}
