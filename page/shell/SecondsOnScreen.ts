/**
 * Whether the view the route names may print a time in whole seconds: a brain's countdown to its end, or, on the Agents view, an agent's
 * running time. The page clock ticks every second only while one may show, and every ten seconds otherwise.
 */
import type { FleetDocument, FleetDocumentForge } from '../@types/FleetDocument.ts';
import type { GaiaRoute }                         from '../shared/HashRouter.ts';

function brainCountsDownIn(forge: FleetDocumentForge): boolean {
  return forge.brain !== 'not-reported' && forge.brain.state === 'running' && forge.brain.endsAt !== null;
}

function agentRunsTimedIn(forge: FleetDocumentForge): boolean {
  return forge.agents.some((row) => row.startedAt !== null);
}

function secondsMayShowIn(route: GaiaRoute, fleetDocument: FleetDocument | null): boolean {
  if (fleetDocument === null) return false;
  const { forges } = fleetDocument;
  switch (route.view) {
    case 'agents':
      return forges.some((forge) => agentRunsTimedIn(forge) || brainCountsDownIn(forge));
    case 'attention':
    case 'forges':
      return forges.some(brainCountsDownIn);
    case 'forge':
      return forges.some((forge) => forge.trackerId === route.trackerId && brainCountsDownIn(forge));
    case 'activity':
      return false;
  }
}

export const SecondsOnScreen = { secondsMayShowIn } as const;
