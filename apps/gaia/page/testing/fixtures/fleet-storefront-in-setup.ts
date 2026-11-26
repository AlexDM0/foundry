/**
 * The example data of the onboarding screens: the five forges' fleet with Example Storefront live but with no pipeline yet, so the only
 * thing of it that waits is the forge's "no pipeline" question (`checks-not-set`), and no agent of it runs. Test-only.
 */
import type { FleetDocument, FleetDocumentAttentionItem } from '../../@types/FleetDocument.ts';

import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from './fleet-five-forges.ts';

const STOREFRONT_TRACKER_ID = FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront;

const STOREFRONT_NO_PIPELINE_QUESTION: FleetDocumentAttentionItem = {
  key:                     'decision:E1',
  kind:                    'question',
  idText:                  'E1',
  ticketIds:               [],
  subject:                 'No pipeline is set for this board',
  jobId:                   null,
  askedBy:                 null,
  decisionKind:            'checks-not-set',
  escalatedFromIncidentId: null,
  metaText:                null,
  stamp:                   '2026-11-12T11:00:00.000Z',
  stampWord:               'opened',
  actionLabel:             'Answer',
  boardRoute:              { tab: 'questions', item: 'E1' },
};

const OTHER_FORGES_ATTENTION = FLEET_FIVE_FORGES.attention.filter((item) => item.trackerId !== STOREFRONT_TRACKER_ID);

const OTHER_FORGES_AGENTS = FLEET_FIVE_FORGES.agents.filter((row) => row.trackerId !== STOREFRONT_TRACKER_ID);

export const FLEET_STOREFRONT_IN_SETUP: FleetDocument = {
  ...FLEET_FIVE_FORGES,
  forges: FLEET_FIVE_FORGES.forges.map((forge) => (
    forge.trackerId === STOREFRONT_TRACKER_ID ? { ...forge, attention: [STOREFRONT_NO_PIPELINE_QUESTION], agents: [] } : forge
  )),
  attention: [...OTHER_FORGES_ATTENTION, { ...STOREFRONT_NO_PIPELINE_QUESTION, trackerId: STOREFRONT_TRACKER_ID }],
  agents:    OTHER_FORGES_AGENTS,
  figures:   {
    ...FLEET_FIVE_FORGES.figures,
    waitingOnUser:  OTHER_FORGES_ATTENTION.length + 1,
    agentsInFlight: OTHER_FORGES_AGENTS.length,
  },
};
