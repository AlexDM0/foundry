/**
 * The board summary ingestion over the summary recorded from a forge as it stands today, read through the forge client, and a summary of
 * the shape `summaryVersion: 1` gives for the Research Wiki of B3. What matters: a forge read through its summary maps to counts and jobs
 * only, with every fact the summary does not hold `null`, never zero; a newer `summaryVersion` maps nothing of the summary.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_DEGRADED } from '../page-api/testing/fleet-snapshot-degraded.ts';

import type { ForgeIdentity, ForgeRegistryFacts }                  from './@types/ForgeDocumentReading.ts';
import { BoardSummaryIngestion }                                   from './BoardSummaryIngestion.ts';
import { EXAMPLE_READ_STAMP, recordedDocumentOf, registryFactsOf } from './testing/ExampleForgeDocuments.ts';

const RECORDED_FORGE_FACTS: ForgeRegistryFacts = {
  trackerId:         '712f8bdb-e7cf-48bc-86a5-2616d2cf935f',
  project:           'Example Project',
  root:              '/Users/alexexample/development/example-project',
  overseerUrl:       'http://127.0.0.1:54795/',
  overseerProcessId: 21_008,
  program:           null,
  lastCommand:       'open',
  lastChangedAt:     '2026-11-12T09:00:00.000Z',
};

/** The recorded identity, which names no contracts. */
const RECORDED_FORGE_IDENTITY: ForgeIdentity = {
  trackerId:      RECORDED_FORGE_FACTS.trackerId,
  project:        'Example Project',
  codeVersion:    '3a6e9e6043da',
  installVersion: 27,
  processId:      21_008,
  contracts:      null,
};

const RESEARCH_WIKI = FLEET_SNAPSHOT_DEGRADED.forges.find((reading) => reading.fidelity === 'counts-only');

/** What a forge before F1 answers for the Research Wiki of B3: one open question, one builder, two ready tickets. */
const RESEARCH_WIKI_SUMMARY = {
  summaryVersion:      1,
  project:             'Research Wiki',
  overseer:            { state: 'serving', paused: false, url: 'http://127.0.0.1:4962' },
  ticketCountByStatus: { 'draft': 0, 'pending': 2, 'in-progress': 1 },
  readyTicketIds:      ['008', '009'],
  jobs:                [{
    id:        'J2',
    kind:      'build',
    ticketIds: ['007'],
    state:     'running',
    role:      'builder',
    tokens:    103_490,
  }],
  openDecisions: 1,
  openIncidents: 0,
  usage:         { resetsAt: null, window: null },
};

function recordedForgeIngestion(): BoardSummaryIngestion {
  return new BoardSummaryIngestion(RECORDED_FORGE_FACTS, RECORDED_FORGE_IDENTITY);
}

async function recordedSummary(): Promise<Record<string, unknown>> {
  return await recordedDocumentOf('serving', 'summary', RECORDED_FORGE_FACTS.overseerUrl) as Record<string, unknown>;
}

describe('a summary at the known version', () => {
  test('maps the Research Wiki\'s summary to the counts-only reading B3\'s fixture shows for it', () => {
    if (RESEARCH_WIKI === undefined) throw new Error('The degraded fixture holds no forge at fidelity counts-only.');
    const identity: ForgeIdentity = {
      trackerId:      RESEARCH_WIKI.trackerId,
      project:        RESEARCH_WIKI.project,
      codeVersion:    '3f9a2c1',
      installVersion: 27,
      processId:      48_390,
      contracts:      null,
    };
    const ingestion = new BoardSummaryIngestion(registryFactsOf(RESEARCH_WIKI), identity);
    // The watch, not the ingestion, adds the versions the forge answered.
    expect(ingestion.readingOf(RESEARCH_WIKI_SUMMARY, '2026-11-12T13:19:15.000Z')).toEqual({ verdict: 'readable', reading: { ...RESEARCH_WIKI, versions: null } });
  });

  test('maps the recorded summary of a paused forge, its one job known only by the keys a summary holds', async () => {
    expect(recordedForgeIngestion().readingOf(await recordedSummary(), EXAMPLE_READ_STAMP)).toEqual({
      verdict: 'readable',
      reading: {
        trackerId: RECORDED_FORGE_FACTS.trackerId,
        project:   'Example Project',
        root:      RECORDED_FORGE_FACTS.root,
        fidelity:  'counts-only',
        condition: 'paused',
        url:       'http://127.0.0.1:54795/',
        processId: 21_008,
        contracts: {
          summary: 1,
          monitor: null,
          control: null,
          embed:   null,
        },
        codeVersion:       '3a6e9e6043da',
        lastReportedAt:    EXAMPLE_READ_STAMP,
        overseerStartedAt: null,
        program:           null,
        lastCommand:       'open',
        lastChangedAt:     '2026-11-12T09:00:00.000Z',
        concurrency:       null,
        readyTicketCount:  0,
        openIncidents:     0,
        attention:         [],
        attentionCount:    1,
        agents:            [{
          jobId:               'J1',
          kind:                'assistant',
          role:                'assistant',
          state:               'running',
          ticketIds:           [],
          tokens:              0,
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
          route:               null,
        }],
        notices:  [],
        warnings: [],
        activity: [],
        today:    null,
        usage:    {
          resetsAt:              null,
          window:                null,
          currentWindow:         null,
          currentWindowResetsAt: null,
        },
        brain:    'not-reported',
        versions: null,
      },
    });
  });

  test('takes the registry\'s address when the summary names none', async () => {
    const summary = await recordedSummary();
    const reading = recordedForgeIngestion().readingOf({ ...summary, overseer: { ...summary['overseer'] as object, url: null } }, EXAMPLE_READ_STAMP);
    expect(reading.verdict === 'readable' ? reading.reading.url : null).toBe(RECORDED_FORGE_FACTS.overseerUrl);
  });
});

describe('a summary at a version this Gaia does not know', () => {
  test('maps nothing of a summary at a newer summaryVersion', async () => {
    const reading = recordedForgeIngestion().readingOf({ ...await recordedSummary(), summaryVersion: 2 }, EXAMPLE_READ_STAMP);
    expect(reading.verdict).toBe('newer-contract');
    if (reading.verdict !== 'newer-contract') return;
    expect([reading.contract, reading.version, reading.reading.fidelity, reading.reading.contracts.summary]).toEqual(['summary', 2, 'newer-contract', 2]);
    expect([reading.reading.agents, reading.reading.attentionCount, reading.reading.readyTicketCount, reading.reading.lastReportedAt]).toEqual([[], null, null, null]);
  });

  test('answers older-contract for a summaryVersion below the known one', async () => {
    expect(recordedForgeIngestion().readingOf({ ...await recordedSummary(), summaryVersion: 0 }, EXAMPLE_READ_STAMP))
      .toEqual({ verdict: 'older-contract', contract: 'summary', version: 0 });
  });
});

describe('a summary that cannot be read', () => {
  test('names each key that is missing or fails its check', async () => {
    const summary = await recordedSummary();
    const broken  = {
      ...summary,
      overseer: { ...summary['overseer'] as object, paused: 'yes' },
      jobs:     [{
        id: 'J1', kind: 'assistant', ticketIds: [7], state: 'running', role: null
      }],
      openDecisions: null,
    };
    expect(recordedForgeIngestion().readingOf(broken, EXAMPLE_READ_STAMP)).toEqual({
      verdict:     'malformed',
      invalidKeys: ['overseer.paused', 'jobs[0].ticketIds', 'jobs[0].tokens', 'openDecisions'],
    });
  });

  test('names a missing summaryVersion before anything else', () => {
    expect(recordedForgeIngestion().readingOf({ project: 'Example Project' }, EXAMPLE_READ_STAMP)).toEqual({ verdict: 'malformed', invalidKeys: ['summaryVersion'] });
  });
});

describe('a summary with keys this Gaia does not know', () => {
  test('reads as it reads one without them, a key named as a minor included', async () => {
    const withoutAddedKeys = recordedForgeIngestion().readingOf(await recordedSummary(), EXAMPLE_READ_STAMP);
    const withAddedKeys = { ...await recordedSummary(), summaryMinor: 3, exampleAddedKey: ['example'] };

    expect(withoutAddedKeys.verdict).toBe('readable');
    expect(recordedForgeIngestion().readingOf(withAddedKeys, EXAMPLE_READ_STAMP)).toEqual(withoutAddedKeys);
  });
});
