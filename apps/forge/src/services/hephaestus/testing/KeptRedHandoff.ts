import type { RedHandoffFacts } from '../../../adapters/red-handoff/RedHandoffIngestion.ts';
import { RedHandoff }           from '../RedHandoff.ts';

/** The red handoff facts kept in `jobFolder`, as a spec expects them; `null` with none. Facts that cannot be read fail the spec. */
export function keptRedHandoffOf(jobFolder: string): RedHandoffFacts | null {
  const reading = RedHandoff.redHandoffReadingOf(jobFolder);
  if (reading.verdict === 'unreadable') throw new Error(`The red handoff in ${jobFolder} cannot be read: ${reading.reason}`);
  return reading.verdict === 'readable' ? reading.facts : null;
}
