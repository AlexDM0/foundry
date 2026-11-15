/** The internal model of the fleet that `page/testing/fixtures/fleet-at-limit.ts` shows: what the page mapper is held against. */
import type { FleetSnapshot } from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeReading }  from '../../../shared/@types/ForgeReading.ts';

import { FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_FIVE_FORGES_READINGS, FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS } from './fleet-snapshot-five-forges.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

const TRACKER_IDS = FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS;

const EXAMPLE_STOREFRONT: ForgeReading = {
  ...READINGS.exampleStorefront,
  concurrency: {
    limit:                        5,
    agentsInFlight:               4,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 0,
  },
};

const INVOICE_SERVICE: ForgeReading = {
  ...READINGS.invoiceService,
  concurrency: {
    limit:                        5,
    agentsInFlight:               3,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 2,
  },
};

const RESEARCH_WIKI: ForgeReading = {
  ...READINGS.researchWiki,
  condition:   'paused',
  concurrency: {
    limit:                        3,
    agentsInFlight:               1,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 1,
  },
};

const EXAMPLE_MOBILE_APP: ForgeReading = {
  ...READINGS.exampleMobileApp,
  concurrency: {
    limit:                        2,
    agentsInFlight:               2,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 0,
  },
};

/** `forge start` is on its way: the forge is still dormant to Gaia, and its condition says what is happening. */
const DESIGN_SYSTEM: ForgeReading = { ...READINGS.designSystem, condition: 'starting' };

export const FLEET_SNAPSHOT_AT_LIMIT: FleetSnapshot = {
  ...FLEET_SNAPSHOT_FIVE_FORGES,
  forges:     [EXAMPLE_STOREFRONT, INVOICE_SERVICE, RESEARCH_WIKI, EXAMPLE_MOBILE_APP, DESIGN_SYSTEM, READINGS.legacyImporter],
  needsALook: [
    { trackerId: TRACKER_IDS.invoiceService, kind: 'machine-limit-reached' },
    { trackerId: TRACKER_IDS.researchWiki, kind: 'machine-limit-reached' },
    { trackerId: TRACKER_IDS.exampleMobileApp, kind: 'launches-held' },
    { trackerId: TRACKER_IDS.designSystem, kind: 'dormant-with-ready-tickets' },
  ],
  machine: { cpuCount: 12, agentsAskedForByForgeLimits: 17, ticketsWaitingForMachineSlot: 3 },
  figures: { ...FLEET_SNAPSHOT_FIVE_FORGES.figures, machineLimit: 10 },
};
