/**
 * The example data of the outage alert: the Attention fleet after a network outage stopped two of Example Storefront's agents and one of
 * Invoice Service's, which wait for User's resume. Example Mobile App's stopped jobs do not count: one was already told to resume and the
 * other's supervision ended. Each of the three serves its presence, so its running Hephaestus and Talos are known.
 */
import type {
  FleetDocument,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge,
  FleetDocumentRunningVersions,
  FleetDocumentWaitingJob,
} from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS } from './fleet-five-forges.ts';

const READINGS = FLEET_FIVE_FORGES_READINGS;

function waitingJobOf(jobId: string, ticketId: string, cause: FleetDocumentWaitingJob['cause'], waitsFor: FleetDocumentWaitingJob['waitsFor']): FleetDocumentWaitingJob {
  return {
    jobId, kind: 'build', ticketIds: [ticketId], cause, waitsFor
  };
}

/** The Talos protocol version the presence the outage readings stand on names. */
export const OUTAGE_TALOS_PROTOCOL_VERSION = 2;

function runningVersionsOf(forge: FleetDocumentForge): FleetDocumentRunningVersions {
  const codeVersion = forge.codeVersion ?? '';
  return {
    hephaestusRunning: codeVersion,
    hephaestusNewest:  null,
    talosRunning:      { protocolVersion: OUTAGE_TALOS_PROTOCOL_VERSION, codeVersion },
    talosNewest:       null,
  };
}

const EXAMPLE_STOREFRONT: FleetDocumentForge = {
  ...READINGS.exampleStorefront,
  runningVersions: runningVersionsOf(READINGS.exampleStorefront),
  waitingWork:     [waitingJobOf('J7', '021', 'network-outage', 'instruction'), waitingJobOf('J9', '024', 'network-outage', 'instruction')],
  outageEndings:   2,
};

const INVOICE_SERVICE: FleetDocumentForge = {
  ...READINGS.invoiceService,
  runningVersions: runningVersionsOf(READINGS.invoiceService),
  waitingWork:     [waitingJobOf('J3', '052', 'network-outage', 'instruction')],
  outageEndings:   1,
};

const EXAMPLE_MOBILE_APP: FleetDocumentForge = {
  ...READINGS.exampleMobileApp,
  runningVersions: runningVersionsOf(READINGS.exampleMobileApp),
  waitingWork:     [waitingJobOf('J5', '061', 'network-outage', 'nothing'), waitingJobOf('J6', '062', 'lease-ended', 'instruction')],
  outageEndings:   0,
};

export const FLEET_OUTAGE_ALERT: FleetDocumentFleetAttentionItem = {
  trackerId:               null,
  key:                     'fleet-alert:agents-ended-on-outage',
  kind:                    'agents-ended-on-outage',
  idText:                  '',
  ticketIds:               [],
  subject:                 '',
  jobId:                   null,
  askedBy:                 null,
  decisionKind:            null,
  escalatedFromIncidentId: null,
  metaText:                null,
  stamp:                   '',
  stampWord:               'last reported',
  actionLabel:             'Open',
  boardRoute:              null,
};

export const FLEET_OUTAGE_ENDINGS: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges:             [EXAMPLE_STOREFRONT, INVOICE_SERVICE, READINGS.researchWiki, EXAMPLE_MOBILE_APP, READINGS.designSystem, READINGS.legacyImporter],
  attention:          [FLEET_OUTAGE_ALERT, ...FLEET_FIVE_FORGES.attention],
  figures:            { ...FLEET_FIVE_FORGES.figures, waitingOnUser: FLEET_FIVE_FORGES.figures.waitingOnUser + 1 },
  outageEndingsTotal: 3,
};
