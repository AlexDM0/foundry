/**
 * What the brand bar says of a fleet document (SCREENS "The shell"): the forges whose Overseer runs counted in the pill, and the other
 * conditions counted in the sentence after it, over the forges not hidden. Before the first document the bar says nothing of the fleet.
 */
import type { FleetDocument, FleetDocumentCondition } from '../@types/FleetDocument.ts';
import type { BrandStatus }                           from '../design-system/BrandBar.tsx';

const SENTENCE_SEPARATOR = ' · ';

/** The conditions under which a forge's Overseer runs. */
const RUNNING_CONDITIONS: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'passing-baton']);

const NO_FORGE_STATUS: BrandStatus = { fleet: 'dormant', pillText: 'No forge registered', sentence: 'nothing runs on this machine yet' };

const EVERY_FORGE_HIDDEN_STATUS: BrandStatus = { fleet: 'dormant', pillText: 'No forge shown', sentence: 'every forge is hidden in Gaia' };

const NO_FORGE_RUNNING_PILL = 'No forge running';

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

/** A clause of the sentence, absent for a count of none. */
function clauseOf(count: number, singularPhrase: string, pluralPhrase = singularPhrase): string | null {
  return count === 0 ? null : countedPhrase(count, singularPhrase, pluralPhrase);
}

function brandStatusOf(fleetDocument: FleetDocument | null): BrandStatus | null {
  if (fleetDocument === null) return null;
  if (fleetDocument.forges.length === 0) return NO_FORGE_STATUS;
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  const forges = fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
  if (forges.length === 0) return EVERY_FORGE_HIDDEN_STATUS;
  const countOf = (condition: FleetDocumentCondition): number => forges.filter((forge) => forge.condition === condition).length;
  const runningCount = forges.filter((forge) => RUNNING_CONDITIONS.has(forge.condition)).length;
  const clauses = [
    clauseOf(countOf('paused'), 'paused'),
    clauseOf(countOf('held'), 'holds its launches', 'hold their launches'),
    clauseOf(countOf('passing-baton'), 'passing the baton'),
    clauseOf(countOf('starting'), 'starting'),
    clauseOf(countOf('dormant'), 'dormant'),
    clauseOf(countOf('unreachable'), 'unreachable'),
    clauseOf(countOf('unreadable'), 'not readable by this Gaia'),
    clauseOf(countOf('missing'), 'repository missing', 'repositories missing'),
  ];
  return {
    fleet:    runningCount === 0 ? 'dormant' : 'running',
    pillText: runningCount === 0 ? NO_FORGE_RUNNING_PILL : countedPhrase(runningCount, 'forge running', 'forges running'),
    sentence: clauses.filter((clause) => clause !== null).join(SENTENCE_SEPARATOR),
  };
}

export const BrandStatusModel = { brandStatusOf } as const;
