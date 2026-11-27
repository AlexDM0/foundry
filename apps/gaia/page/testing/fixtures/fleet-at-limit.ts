/**
 * The example data of the start, stop and refusal artboard: the fleet of `fleet-five-forges` with the machine limit lowered to 10 and
 * reached, Research Wiki paused and Design System starting.
 */
import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS, FLEET_FIVE_FORGES_TRACKER_IDS } from './fleet-five-forges.ts';

const READINGS = FLEET_FIVE_FORGES_READINGS;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const EXAMPLE_STOREFRONT: FleetDocumentForge = {
  ...READINGS.exampleStorefront,
  concurrency: {
    limit:                        5,
    agentsInFlight:               4,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 0,
  },
};

const INVOICE_SERVICE: FleetDocumentForge = {
  ...READINGS.invoiceService,
  concurrency: {
    limit:                        5,
    agentsInFlight:               3,
    machineLimit:                 10,
    machineAgentsInFlight:        10,
    ticketsWaitingForMachineSlot: 2,
  },
};

const RESEARCH_WIKI: FleetDocumentForge = {
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

const EXAMPLE_MOBILE_APP: FleetDocumentForge = {
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
const DESIGN_SYSTEM: FleetDocumentForge = { ...READINGS.designSystem, condition: 'starting', presence: { state: 'serving', generation: null, at: null } };

export const FLEET_AT_LIMIT: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges:     [EXAMPLE_STOREFRONT, INVOICE_SERVICE, RESEARCH_WIKI, EXAMPLE_MOBILE_APP, DESIGN_SYSTEM, READINGS.legacyImporter],
  needsALook: [
    { trackerId: TRACKER_IDS.invoiceService, kind: 'machine-limit-reached' },
    { trackerId: TRACKER_IDS.researchWiki, kind: 'machine-limit-reached' },
    { trackerId: TRACKER_IDS.exampleMobileApp, kind: 'launches-held' },
    { trackerId: TRACKER_IDS.designSystem, kind: 'dormant-with-ready-tickets' },
  ],
  machine: { cpuCount: 12, agentsAskedForByForgeLimits: 17, ticketsWaitingForMachineSlot: 3 },
  figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: 10 },
};
