/**
 * The example data of a crashed forge in place, which no artboard draws (owner answer 5): the five forges' fleet with Example Storefront
 * off after its Hephaestus crashed, as the registry's crash summary tells it, and then started again, listing the crash log it wrote, which
 * Gaia reads once User opens it. Test-only.
 */
import type { CrashLogDocument }                  from '../../@types/CrashLogDocument.ts';
import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from './fleet-five-forges.ts';

const STOREFRONT_TRACKER_ID = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

const CRASHED_AT = '2026-11-12T13:17:42.000Z';

export const STOREFRONT_CRASH_LOG: CrashLogDocument = {
  crashLogVersion: 1,
  number:          1,
  generation:      1,
  component:       'hephaestus',
  suspected:       false,
  recordedAt:      CRASHED_AT,
  error:           {
    origin:  'uncaught-exception',
    name:    'TypeError',
    message: 'Cannot read properties of undefined (reading \'ticketIds\')',
    stack:   'TypeError: Cannot read properties of undefined (reading \'ticketIds\')\n    at examplePass (src/services/hephaestus/ExamplePass.ts:42:17)',
  },
  activeJobs: [
    {
      jobId: 'J3', kind: 'build', ticketIds: ['014'], state: 'running', interruption: null, airlockPhase: null,
    },
    {
      jobId: 'J4', kind: 'build', ticketIds: ['016'], state: 'running', interruption: null, airlockPhase: null,
    },
  ],
  logTail: [
    '2026-11-12T13:17:40Z Job J3 asked E2: How long should a password reset link stay valid?',
    '2026-11-12T13:17:41Z Pass 412 started.',
    '2026-11-12T13:17:42Z Hephaestus crashed in pass 412: TypeError.',
  ],
};

function fleetWithStorefront(storefrontChanges: Partial<FleetDocumentForge>, keepsItsAgents: boolean): FleetDocument {
  return {
    ...FLEET_FIVE_FORGES,
    forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === STOREFRONT_TRACKER_ID ? { ...forge, ...storefrontChanges } : forge)),
    agents: keepsItsAgents ? FLEET_FIVE_FORGES.agents : FLEET_FIVE_FORGES.agents.filter((row) => row.trackerId !== STOREFRONT_TRACKER_ID),
  };
}

/** Off after the crash: no Hephaestus answers, so Gaia shows the registry's crash summary, and nothing runs until User starts it. */
export const FLEET_STOREFRONT_CRASHED: FleetDocument = fleetWithStorefront({
  fidelity:     'unreachable',
  condition:    'unreachable',
  url:          null,
  processId:    null,
  agents:       [],
  presence:     { state: 'crashed', generation: 1, at: CRASHED_AT },
  crashSummary: {
    component: 'hephaestus', suspected: false, errorName: 'TypeError', errorMessage: STOREFRONT_CRASH_LOG.error?.message ?? null,
  },
}, false);

/** Started again by User: it serves, lists the crash log it wrote, and its jobs the crash stopped resume by themselves. */
export const FLEET_STOREFRONT_STARTED_AFTER_A_CRASH: FleetDocument = fleetWithStorefront({
  hephaestusStartedAt: FLEET_FIXTURES_READ_AT,
  presence:            { state: 'serving', generation: 2, at: FLEET_FIXTURES_READ_AT },
  crashLogs:           [{
    number:     STOREFRONT_CRASH_LOG.number,
    generation: STOREFRONT_CRASH_LOG.generation,
    component:  STOREFRONT_CRASH_LOG.component,
    suspected:  STOREFRONT_CRASH_LOG.suspected,
    recordedAt: STOREFRONT_CRASH_LOG.recordedAt,
  }],
}, true);
