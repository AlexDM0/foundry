/** The internal model of the fleet that `page/testing/fixtures/fleet-versions.ts` shows: what the page mapper is held against. */
import type { AgentRow }                    from '../../../shared/@types/AgentRow.ts';
import type { AttentionItem }               from '../../../shared/@types/AttentionItem.ts';
import type { FleetForge, FleetSnapshot }   from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeReading, ForgeVersions } from '../../../shared/@types/ForgeReading.ts';

import { FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_FIVE_FORGES_READINGS, FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS } from './fleet-snapshot-five-forges.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

export const FLEET_SNAPSHOT_VERSIONS_TRACKER_IDS = {
  exampleStorefront: FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS.exampleStorefront,
  invoiceService:    FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS.invoiceService,
  researchWiki:      FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS.researchWiki,
  exampleBilling:    'example-billing-6e3a',
  analyticsSandbox:  'analytics-sandbox-4d18',
  exampleDocs:       'example-docs-1f57',
} as const;

const TRACKER_IDS = FLEET_SNAPSHOT_VERSIONS_TRACKER_IDS;

/** The versions each board draws, by the forge's verdict against this Gaia's forge 3.1. */
const FORGE_VERSIONS = {
  ahead:           { verdict: 'ahead', current: { major: 3, minor: 4 }, minimumSupported: { major: 3, minor: 0 } },
  current:         { verdict: 'current', current: { major: 3, minor: 1 }, minimumSupported: { major: 3, minor: 0 } },
  older:           { verdict: 'older', current: { major: 1, minor: 8 }, minimumSupported: { major: 1, minor: 0 } },
  newer:           { verdict: 'newer', current: { major: 4, minor: 1 }, minimumSupported: { major: 4, minor: 0 } },
  statesNoVersion: { verdict: 'older', current: null, minimumSupported: null },
} as const satisfies Readonly<Record<string, ForgeVersions>>;

const VERSIONS = FORGE_VERSIONS;

const WIKI_QUESTION_E7: AttentionItem = {
  key:                     'decision:E7',
  kind:                    'question',
  idText:                  'E7',
  ticketIds:               ['009'],
  subject:                 'Should the glossary link to archived pages?',
  jobId:                   'J21',
  askedBy:                 'J21',
  decisionKind:            null,
  escalatedFromIncidentId: null,
  metaText:                'asked by J21 builder',
  stamp:                   '2026-11-12T13:10:30.000Z',
  stampWord:               'opened',
  actionLabel:             'Answer',
  boardRoute:              { tab: 'questions', item: 'E7' },
};

const WIKI_J21: AgentRow = {
  jobId:               'J21',
  kind:                'build',
  role:                'builder',
  state:               'waiting-for-answer',
  ticketIds:           ['009'],
  tokens:              38_400,
  ticketTitle:         'Glossary links',
  attempt:             1,
  startedAt:           '2026-11-12T13:01:40.000Z',
  calls:               17,
  callBudget:          120,
  toolCalls:           36,
  lastToolCall:        'Bash forge ask',
  runningSubagents:    0,
  silentSweeps:        0,
  quiet:               false,
  turn:                'mid-turn',
  messagesWaiting:     0,
  lastLine:            'Asked E7 and waits for the answer.',
  waitingOnDecisionId: 'E7',
  interruption:        null,
  boardRoute:          { tab: 'agents', item: 'J21' },
};

const EXAMPLE_STOREFRONT: FleetForge = {
  ...READINGS.exampleStorefront,
  versions: VERSIONS.ahead,
};

const INVOICE_SERVICE: FleetForge = {
  ...READINGS.invoiceService,
  versions: VERSIONS.current,
};

const RESEARCH_WIKI: FleetForge = {
  ...READINGS.researchWiki,
  attention: [WIKI_QUESTION_E7],
  agents:    [WIKI_J21],
  activity:  READINGS.researchWiki.activity.filter((entry) => entry.category === 'landed'),
  versions:  VERSIONS.current,
};

/** What the server reads of a forge it cannot talk to: its place in the registry and its versions, nothing more. */
function readFromTheRegistryAlone(
  facts: Pick<ForgeReading, 'trackerId' | 'project' | 'root' | 'url' | 'processId' | 'lastChangedAt'>,
  versions: ForgeVersions,
): FleetForge {
  return {
    ...facts,
    fidelity:  versions.verdict === 'newer' ? 'newer-contract' : 'older-contract',
    condition: 'unreadable',
    contracts: {
      summary: null,
      monitor: null,
      control: null,
    },
    codeVersion:         null,
    lastReportedAt:      null,
    hephaestusStartedAt: null,
    program:             '/Users/alexexample/.bun/bin/forge',
    lastCommand:         null,
    concurrency:         null,
    readyTicketCount:    null,
    openIncidents:       null,
    attention:           [],
    attentionCount:      null,
    agents:              [],
    notices:             [],
    warnings:            [],
    activity:            [],
    today:               null,
    usage:               null,
    versions,
    registryPresence:    null,
    presenceReport:      null,
    newestVersions:      null,
    presence:            { state: versions.verdict === 'newer' ? 'serving' : 'unknown', generation: null, at: null },
    crashSummary:        null,
    crashLogs:           [],
    waitingWork:         [],
    outageEndings:       0,
    runningVersions:     null,
  };
}

const EXAMPLE_BILLING = readFromTheRegistryAlone({
  trackerId:     TRACKER_IDS.exampleBilling,
  project:       'Example Billing',
  root:          '/Users/alexexample/development/example-billing',
  url:           'http://127.0.0.1:4971',
  processId:     48_655,
  lastChangedAt: '2026-11-12T09:40:00.000Z',
}, VERSIONS.older);

const ANALYTICS_SANDBOX = readFromTheRegistryAlone({
  trackerId:     TRACKER_IDS.analyticsSandbox,
  project:       'Analytics Sandbox',
  root:          '/Users/alexexample/development/analytics-sandbox',
  url:           'http://127.0.0.1:4983',
  processId:     49_012,
  lastChangedAt: '2026-11-12T10:05:00.000Z',
}, VERSIONS.newer);

const EXAMPLE_DOCS = readFromTheRegistryAlone({
  trackerId:     TRACKER_IDS.exampleDocs,
  project:       'Example Docs',
  root:          '/Users/alexexample/development/example-docs',
  url:           'http://127.0.0.1:4977',
  processId:     48_702,
  lastChangedAt: '2026-11-12T08:55:00.000Z',
}, VERSIONS.statesNoVersion);

/** Each forge of the boards, Example Docs included, for the specs and screens that word one forge. */
export const FLEET_SNAPSHOT_VERSIONS_READINGS = {
  exampleStorefront: EXAMPLE_STOREFRONT,
  invoiceService:    INVOICE_SERVICE,
  researchWiki:      RESEARCH_WIKI,
  exampleBilling:    EXAMPLE_BILLING,
  analyticsSandbox:  ANALYTICS_SANDBOX,
  exampleDocs:       EXAMPLE_DOCS,
} as const;

/** This Gaia's own facts on the boards: version 1.4, built for forge 3.1. */
const GAIA_VERSIONS: FleetSnapshot['gaia']['versions'] = {
  systemVersion:         { major: 1, minor: 4 },
  supportedForgeVersion: { major: 3, minor: 1 },
};

function activityOf(forge: ForgeReading, logPosition: number) {
  const entry = forge.activity.find((candidate) => candidate.logPosition === logPosition);
  if (entry === undefined) throw new Error(`The fixture names log position ${logPosition}, which ${forge.project} does not hold.`);
  return { ...entry, trackerId: forge.trackerId };
}

function agentOf(forge: ForgeReading, jobId: string) {
  const row = forge.agents.find((candidate) => candidate.jobId === jobId);
  if (row === undefined) throw new Error(`The fixture names job ${jobId}, which ${forge.project} does not run.`);
  return { ...row, trackerId: forge.trackerId };
}

function attentionOf(forge: ForgeReading, idText: string) {
  const item = forge.attention.find((candidate) => candidate.idText === idText);
  if (item === undefined) throw new Error(`The fixture names ${idText}, which does not wait in ${forge.project}.`);
  return { ...item, trackerId: forge.trackerId };
}

/** The five forges, one at each verdict and two current; the totals leave out the two Gaia cannot talk to. */
export const FLEET_SNAPSHOT_VERSIONS: FleetSnapshot = {
  ...FLEET_SNAPSHOT_FIVE_FORGES,
  forges:    [EXAMPLE_STOREFRONT, INVOICE_SERVICE, RESEARCH_WIKI, EXAMPLE_BILLING, ANALYTICS_SANDBOX],
  attention: [
    attentionOf(INVOICE_SERVICE, 'E4'),
    attentionOf(EXAMPLE_STOREFRONT, '#015'),
    attentionOf(INVOICE_SERVICE, '#031'),
    attentionOf(EXAMPLE_STOREFRONT, 'E2'),
    attentionOf(RESEARCH_WIKI, 'E7'),
  ],
  needsALook: [
    { trackerId: TRACKER_IDS.exampleBilling, kind: 'older-contract' },
    { trackerId: TRACKER_IDS.analyticsSandbox, kind: 'newer-contract' },
  ],
  agents: [
    agentOf(EXAMPLE_STOREFRONT, 'J2'),
    agentOf(EXAMPLE_STOREFRONT, 'J3'),
    agentOf(EXAMPLE_STOREFRONT, 'J4'),
    agentOf(EXAMPLE_STOREFRONT, 'J6'),
    agentOf(INVOICE_SERVICE, 'J11'),
    agentOf(INVOICE_SERVICE, 'J12'),
    agentOf(INVOICE_SERVICE, 'J14'),
    agentOf(RESEARCH_WIKI, 'J21'),
  ],
  activity: [
    activityOf(EXAMPLE_STOREFRONT, 455),
    activityOf(EXAMPLE_STOREFRONT, 452),
    activityOf(INVOICE_SERVICE, 321),
    activityOf(EXAMPLE_STOREFRONT, 447),
    activityOf(INVOICE_SERVICE, 318),
    activityOf(INVOICE_SERVICE, 315),
    activityOf(RESEARCH_WIKI, 120),
    activityOf(INVOICE_SERVICE, 309),
    activityOf(EXAMPLE_STOREFRONT, 431),
    activityOf(INVOICE_SERVICE, 301),
    activityOf(EXAMPLE_STOREFRONT, 418),
    activityOf(EXAMPLE_STOREFRONT, 412),
  ],
  machine: { cpuCount: 12, agentsAskedForByForgeLimits: 13, ticketsWaitingForMachineSlot: 0 },
  figures: {
    waitingOnUser:  5,
    agentsInFlight: 8,
    machineLimit:   12,
    readyTickets:   9,
    deliveredToday: 5,
    tokensToday:    1_020_000,
    openIncidents:  0,
    incompleteFor:  [TRACKER_IDS.exampleBilling, TRACKER_IDS.analyticsSandbox],
  },
  gaia: { ...FLEET_SNAPSHOT_FIVE_FORGES.gaia, versions: GAIA_VERSIONS },
};

/** A forge that states no version, Example Docs, in Example Billing's place: every released forge reads so today. */
export const FLEET_SNAPSHOT_VERSIONS_STATING_NO_VERSION: FleetSnapshot = {
  ...FLEET_SNAPSHOT_VERSIONS,
  forges:     FLEET_SNAPSHOT_VERSIONS.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleBilling ? EXAMPLE_DOCS : forge)),
  needsALook: FLEET_SNAPSHOT_VERSIONS.needsALook.map((look) => (look.trackerId === TRACKER_IDS.exampleBilling ? { ...look, trackerId: TRACKER_IDS.exampleDocs } : look)),
  figures:    {
    ...FLEET_SNAPSHOT_VERSIONS.figures,
    incompleteFor: [TRACKER_IDS.exampleDocs, TRACKER_IDS.analyticsSandbox],
  },
};
