/** What `stop` and `restart` share: the stop of the live Hephaestus, closed in its place when it ended before finishing, and its report. */
import type { HephaestusFiles }                                      from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusRemote, type HephaestusEnding, type StopOutcome } from '../HephaestusRemote.ts';
import { type StoppedHephaestusRequest, closeTheStoppedHephaestus }  from './HephaestusForeground.ts';

export interface StopReport {
  entity:    { outcome: 'done' | 'nothing-to-do'; ending?: Exclude<HephaestusEnding, 'clean'> };
  humanLine: string;
}

/**
 * An ending other than `clean` means the process is gone, by a dead Hephaestus lock or a landed force, so what Hephaestus left undone runs without it. A
 * newest Hephaestus lock found dead is closed the same way, so a close that was refused before is repaired by the next stop.
 */
export async function stopAndCloseTheLiveHephaestus(request: StoppedHephaestusRequest, files: HephaestusFiles, now: boolean): Promise<StopOutcome> {
  const stopped = await HephaestusRemote.stopTheLiveHephaestus(request.context.platformPorts, files, 'hephaestus-stop', now);
  const leftUnclosed = stopped.verdict === 'found-dead' || (stopped.verdict === 'stopped' && stopped.ending !== 'clean');
  if (leftUnclosed) await closeTheStoppedHephaestus(request, files, stopped.generation);
  return stopped;
}

function stopTextOf(stopped: Exclude<StopOutcome, { verdict: 'was-down' }>, now: boolean): string {
  const hephaestusAtUrl = stopped.record === null ? 'Hephaestus' : `Hephaestus at ${stopped.record.url}`;
  const lineChildNote = now ? ' Line children were not stopped: --now needs the API.' : '';
  const closing       = `this command recorded the stop in its place.${lineChildNote}`;
  if (stopped.verdict === 'found-dead') return `${hephaestusAtUrl} had already ended before it finished its stop, so ${closing}`;
  const { ending, record } = stopped;
  if (ending === 'clean') return `Stopped Hephaestus at ${record.url}.`;
  if (ending === 'forced') return `Ended Hephaestus at ${record.url} by force: its API did not answer and it could not finish its stop, so ${closing}`;
  return `${hephaestusAtUrl} ended before it finished its stop, so ${closing}`;
}

export async function stopHephaestus(request: StoppedHephaestusRequest, files: HephaestusFiles, now: boolean): Promise<StopReport> {
  const stopped = await stopAndCloseTheLiveHephaestus(request, files, now);
  if (stopped.verdict === 'was-down') return { entity: { outcome: 'nothing-to-do' }, humanLine: 'No Hephaestus is live; nothing to stop.' };
  const ending = stopped.verdict === 'found-dead' ? 'unfinished' : stopped.ending;
  return { entity: ending === 'clean' ? { outcome: 'done' } : { outcome: 'done', ending }, humanLine: stopTextOf(stopped, now) };
}
