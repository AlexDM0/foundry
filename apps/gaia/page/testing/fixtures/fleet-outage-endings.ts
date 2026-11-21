/**
 * The example data of the outage alert: A1's fleet after a network outage stopped two of Example Storefront's agents and one of Invoice
 * Service's, which wait for User's resume. Example Mobile App holds a job the outage stopped that was already told to resume and one whose
 * supervision ended: neither counts. The fleet's alert heads what waits on User.
 */
import type {
  FleetDocument,
  FleetDocumentFleetAttentionItem,
  FleetDocumentForge,
  FleetDocumentWaitingJob,
} from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS } from './fleet-five-forges.ts';

const READINGS = FLEET_FIVE_FORGES_READINGS;

function waitingJobOf(jobId: string, ticketId: string, cause: FleetDocumentWaitingJob['cause'], waitsFor: FleetDocumentWaitingJob['waitsFor']): FleetDocumentWaitingJob {
  return {
    jobId, kind: 'build', ticketIds: [ticketId], cause, waitsFor
  };
}

const EXAMPLE_STOREFRONT: FleetDocumentForge = {
  ...READINGS.exampleStorefront,
  waitingWork:   [waitingJobOf('J7', '021', 'network-outage', 'instruction'), waitingJobOf('J9', '024', 'network-outage', 'instruction')],
  outageEndings: 2,
};

const INVOICE_SERVICE: FleetDocumentForge = {
  ...READINGS.invoiceService,
  waitingWork:   [waitingJobOf('J3', '052', 'network-outage', 'instruction')],
  outageEndings: 1,
};

const EXAMPLE_MOBILE_APP: FleetDocumentForge = {
  ...READINGS.exampleMobileApp,
  waitingWork:   [waitingJobOf('J5', '061', 'network-outage', 'nothing'), waitingJobOf('J6', '062', 'lease-ended', 'instruction')],
  outageEndings: 0,
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
