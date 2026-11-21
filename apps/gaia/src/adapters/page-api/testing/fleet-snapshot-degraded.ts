/** The internal model of the fleet that `page/testing/fixtures/fleet-degraded.ts` shows: what the page mapper is held against. */
import type { AgentRow }                  from '../../../shared/@types/AgentRow.ts';
import type { FleetForge, FleetSnapshot } from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeUsage }                from '../../../shared/@types/ForgeReading.ts';

import {
  CURRENT_FORGE_VERSIONS,
  FLEET_SNAPSHOT_FIVE_FORGES,
  FLEET_SNAPSHOT_FIVE_FORGES_READINGS,
  FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS,
} from './fleet-snapshot-five-forges.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

const TRACKER_IDS = { ...FLEET_SNAPSHOT_FIVE_FORGES_TRACKER_IDS, analyticsSandbox: 'analytics-sandbox-4d18' } as const;

/** A summary reports the usage limit hit and no current window. */
const USAGE_OF_A_SUMMARY: ForgeUsage = {
  resetsAt:              null,
  window:                null,
  currentWindow:         null,
  currentWindowResetsAt: null,
};

const INVOICE_SERVICE: FleetForge = {
  ...READINGS.invoiceService,
  fidelity:       'unreachable',
  condition:      'unreachable',
  lastReportedAt: '2026-11-12T13:14:05.000Z',
  presence:       { state: 'unknown', generation: null, at: null },
};

/** A job read through `summaryVersion: 1`: what the summary does not hold is `null`, never zero. */
const WIKI_COUNTS_ONLY_J2: AgentRow = {
  jobId:               'J2',
  kind:                'build',
  role:                'builder',
  state:               'running',
  ticketIds:           ['007'],
  tokens:              103_490,
  ticketTitle:         null,
  attempt:             null,
  startedAt:           null,
  calls:               null,
  callBudget:          null,
  toolCalls:           null,
  lastToolCall:        null,
  runningSubagents:    null,
  silentSweeps:        null,
  quiet:               null,
  turn:                null,
  messagesWaiting:     null,
  lastLine:            null,
  waitingOnDecisionId: null,
  interruption:        null,
  boardRoute:          null,
};

const RESEARCH_WIKI: FleetForge = {
  trackerId: TRACKER_IDS.researchWiki,
  project:   'Research Wiki',
  root:      '/Users/alexexample/development/research-wiki',
  fidelity:  'counts-only',
  condition: 'live',
  url:       'http://127.0.0.1:4962',
  processId: 48_390,
  contracts: {
    summary: 1,
    monitor: null,
    control: null,
    embed:   null,
  },
  codeVersion:       '3f9a2c1',
  lastReportedAt:    '2026-11-12T13:19:15.000Z',
  overseerStartedAt: null,
  program:           '/Users/alexexample/.bun/bin/forge',
  lastCommand:       'open',
  lastChangedAt:     '2026-11-12T11:02:00.000Z',
  concurrency:       null,
  readyTicketCount:  2,
  openIncidents:     0,
  attention:         [],
  attentionCount:    1,
  agents:            [WIKI_COUNTS_ONLY_J2],
  notices:           [],
  warnings:          [],
  activity:          [],
  today:             null,
  usage:             USAGE_OF_A_SUMMARY,
  brain:             'not-reported',
  versions:          CURRENT_FORGE_VERSIONS,
  registryPresence:  null,
  presenceReport:    null,
  presence:          { state: 'serving', generation: null, at: null },
  crashSummary:      null,
  crashLogs:         [],
  waitingWork:       [],
  outageEndings:     0,
};

const ANALYTICS_SANDBOX: FleetForge = {
  trackerId: TRACKER_IDS.analyticsSandbox,
  project:   'Analytics Sandbox',
  root:      '/Users/alexexample/development/analytics-sandbox',
  fidelity:  'newer-contract',
  condition: 'unreadable',
  url:       'http://127.0.0.1:4983',
  processId: 49_012,
  contracts: {
    summary: 1,
    monitor: 4,
    control: 3,
    embed:   1,
  },
  codeVersion:       '9c04e5b',
  lastReportedAt:    null,
  overseerStartedAt: null,
  program:           '/Users/alexexample/.bun/bin/forge',
  lastCommand:       'open',
  lastChangedAt:     '2026-11-12T10:05:00.000Z',
  concurrency:       null,
  readyTicketCount:  null,
  openIncidents:     null,
  attention:         [],
  attentionCount:    null,
  agents:            [],
  notices:           [],
  warnings:          [],
  activity:          [],
  today:             null,
  usage:             null,
  brain:             'not-reported',
  versions:          CURRENT_FORGE_VERSIONS,
  registryPresence:  null,
  presenceReport:    null,
  presence:          { state: 'serving', generation: null, at: null },
  crashSummary:      null,
  crashLogs:         [],
  waitingWork:       [],
  outageEndings:     0,
};

const WIKI_COUNTS_ONLY_J2_ROW = { ...WIKI_COUNTS_ONLY_J2, trackerId: TRACKER_IDS.researchWiki, countsAgainstLimit: true };

const READ_IN_FULL_OR_AS_LAST_REPORTED = new Set<string>([TRACKER_IDS.exampleStorefront, TRACKER_IDS.invoiceService, TRACKER_IDS.exampleMobileApp]);

export const FLEET_SNAPSHOT_DEGRADED: FleetSnapshot = {
  ...FLEET_SNAPSHOT_FIVE_FORGES,
  forges:     [READINGS.exampleStorefront, INVOICE_SERVICE, RESEARCH_WIKI, READINGS.exampleMobileApp, ANALYTICS_SANDBOX],
  attention:  FLEET_SNAPSHOT_FIVE_FORGES.attention.filter((item) => item.trackerId !== null && READ_IN_FULL_OR_AS_LAST_REPORTED.has(item.trackerId)),
  needsALook: [
    { trackerId: TRACKER_IDS.invoiceService, kind: 'unreachable' },
    { trackerId: TRACKER_IDS.researchWiki, kind: 'counts-only' },
    { trackerId: TRACKER_IDS.exampleMobileApp, kind: 'launches-held' },
    { trackerId: TRACKER_IDS.analyticsSandbox, kind: 'newer-contract' },
  ],
  agents:   FLEET_SNAPSHOT_FIVE_FORGES.agents.map((row) => (row.trackerId === TRACKER_IDS.researchWiki ? WIKI_COUNTS_ONLY_J2_ROW : row)),
  activity: FLEET_SNAPSHOT_FIVE_FORGES.activity.filter((entry) => READ_IN_FULL_OR_AS_LAST_REPORTED.has(entry.trackerId)),
  machine:  { cpuCount: 12, agentsAskedForByForgeLimits: 12, ticketsWaitingForMachineSlot: 0 },
  figures:  {
    waitingOnUser:  4,
    agentsInFlight: 10,
    machineLimit:   12,
    readyTickets:   8,
    deliveredToday: 5,
    tokensToday:    1_076_000,
    openIncidents:  0,
    incompleteFor:  [TRACKER_IDS.invoiceService, TRACKER_IDS.researchWiki, TRACKER_IDS.analyticsSandbox],
  },
};
