/**
 * The example data of artboard B1's `brain` tweak: the fleet of `fleet-five-forges` with Example Storefront's brain in each of its five
 * states, as B1 draws them, and the brain's agent row only while it runs. Storefront publishes control contract 2, which carries the
 * brain's commands, so its bar offers Wake and Stop as B1 draws them.
 */
import { FLINT_BRAIN_CONTRACT_VERSIONS }                                   from 'forge-contracts/OverseerContractVersions';
import type { FleetDocument, FleetDocumentBrain, FleetDocumentBrainState } from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS, FLEET_FIVE_FORGES_TRACKER_IDS } from './fleet-five-forges.ts';

const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

const NO_BRAIN_FACTS = {
  startedAt:   null,
  endsAt:      null,
  startedBy:   null,
  model:       null,
  effort:      null,
  tokens:      null,
  calls:       null,
  recentMoves: [],
  endedAt:     null,
  endedReason: null,
  sentence:    null,
  refusal:     null,
} as const satisfies Omit<FleetDocumentBrain, 'state'>;

function storefrontRunningBrain(): FleetDocumentBrain {
  const { brain } = STOREFRONT;
  if (brain === 'not-reported' || brain.state !== 'running') throw new Error('The five forges\' fixture no longer runs Example Storefront\'s brain.');
  return brain;
}

/** Each state of B1's tweak: woken from Gaia a moment ago; running with 1:24 left; refused while the usage limit holds; ended 45 s ago. */
export const STOREFRONT_BRAINS: Readonly<Record<FleetDocumentBrainState, FleetDocumentBrain>> = {
  off:      { ...NO_BRAIN_FACTS, state: 'off' },
  starting: {
    ...NO_BRAIN_FACTS,
    state:     'starting',
    startedAt: '2026-11-12T13:19:28.000Z',
    startedBy: 'api',
    model:     'haiku',
    effort:    'low',
    sentence:  'Flint\'s brain is waking',
  },
  running: storefrontRunningBrain(),
  refused: {
    ...NO_BRAIN_FACTS,
    state:    'refused',
    sentence: 'Flint\'s brain did not start',
    refusal:  { code: 'usage-limit-holds', sentence: 'launches are held until 16:00 (usage limit)' },
  },
  ended: {
    ...NO_BRAIN_FACTS,
    state:       'ended',
    startedAt:   '2026-11-12T13:16:45.000Z',
    endsAt:      '2026-11-12T13:18:45.000Z',
    startedBy:   'api',
    model:       'haiku',
    effort:      'low',
    tokens:      4_200,
    calls:       14,
    endedAt:     '2026-11-12T13:18:45.000Z',
    endedReason: 'time',
    sentence:    'Flint\'s brain stopped after 2:00 · 4.2k tokens',
  },
};

export const FLINT_BRAIN_JOB_ID = 'flint-brain';

/** The five forges with Example Storefront's brain in the state named, its commands served; its agent row stays only while the brain runs. */
export function fleetWithStorefrontBrainOf(state: FleetDocumentBrainState): FleetDocument {
  return {
    ...FLEET_FIVE_FORGES,
    forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront
      ? { ...forge, contracts: { ...forge.contracts, control: FLINT_BRAIN_CONTRACT_VERSIONS.control }, brain: STOREFRONT_BRAINS[state] }
      : forge)),
    agents: state === 'running' ? FLEET_FIVE_FORGES.agents : FLEET_FIVE_FORGES.agents.filter((row) => row.jobId !== FLINT_BRAIN_JOB_ID),
  };
}
