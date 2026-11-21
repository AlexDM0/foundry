/**
 * What the brand bar says of a fleet document (SCREENS "The shell"): the forges whose Overseer runs counted in the pill, and the other
 * conditions counted in the sentence after it, over the forges not hidden. Before the first document the bar says nothing of the fleet.
 */
import type { FleetDocument, FleetDocumentCondition } from '../@types/FleetDocument.ts';
import type { BrandStatus }                           from '../components/BrandBar.tsx';
import { CountTextUtil }                              from '../shared/utils/CountTextUtil.ts';
import { ForgeTextUtil, type ShownCondition }         from '../shared/utils/ForgeTextUtil.ts';

const SENTENCE_SEPARATOR = ' · ';

/** The conditions under which a forge's Overseer runs. */
const RUNNING_CONDITIONS: ReadonlySet<FleetDocumentCondition> = new Set(['live', 'paused', 'held', 'passing-baton']);

/** A forge at a version Gaia cannot talk to answered its versions, so its Overseer runs, whatever Gaia reads of it. */
function overseerRuns(forge: FleetDocument['forges'][number]): boolean {
  const answeredAtAnotherVersion = forge.versions?.verdict === 'older' || forge.versions?.verdict === 'newer';
  return answeredAtAnotherVersion || RUNNING_CONDITIONS.has(forge.condition);
}

const NO_FORGE_STATUS: BrandStatus = { fleet: 'dormant', pillText: 'No forge registered', sentence: 'nothing runs on this machine yet' };

const EVERY_FORGE_HIDDEN_STATUS: BrandStatus = { fleet: 'dormant', pillText: 'No forge shown', sentence: 'every forge is hidden in Gaia' };

const NO_FORGE_RUNNING_PILL = 'No forge running';

/** A clause of the sentence, absent for a count of none. */
function clauseOf(count: number, singularPhrase: string, pluralPhrase = singularPhrase): string | null {
  return count === 0 ? null : CountTextUtil.countedPhrase(count, singularPhrase, pluralPhrase);
}

function brandStatusOf(fleetDocument: FleetDocument | null): BrandStatus | null {
  if (fleetDocument === null) return null;
  if (fleetDocument.forges.length === 0) return NO_FORGE_STATUS;
  const hidden = new Set(fleetDocument.settings.hiddenTrackerIds);
  const forges = fleetDocument.forges.filter((forge) => !hidden.has(forge.trackerId));
  if (forges.length === 0) return EVERY_FORGE_HIDDEN_STATUS;
  const countOf = (condition: ShownCondition): number => forges.filter((forge) => ForgeTextUtil.shownConditionOf(forge) === condition).length;
  const runningCount = forges.filter(overseerRuns).length;
  const clauses = [
    clauseOf(countOf('paused'), 'paused'),
    clauseOf(countOf('held'), 'holds its launches', 'hold their launches'),
    clauseOf(countOf('passing-baton'), 'passing the baton'),
    clauseOf(countOf('starting'), 'starting'),
    clauseOf(countOf('dormant'), 'dormant'),
    clauseOf(countOf('unreachable'), 'unreachable'),
    clauseOf(countOf('outdated'), 'needs a forge update', 'need a forge update'),
    clauseOf(countOf('unreadable'), 'not readable by this Gaia'),
    clauseOf(countOf('missing'), 'repository missing', 'repositories missing'),
  ];
  return {
    fleet:    runningCount === 0 ? 'dormant' : 'running',
    pillText: runningCount === 0 ? NO_FORGE_RUNNING_PILL : CountTextUtil.countedPhrase(runningCount, 'forge running', 'forges running'),
    sentence: clauses.filter((clause) => clause !== null).join(SENTENCE_SEPARATOR),
  };
}

export const BrandStatusModel = { brandStatusOf } as const;
