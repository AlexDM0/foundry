/**
 * What a forge in place shows of a fleet document. What matters (SCREENS B1, with A4's buttons per condition and B2's Stop question): the
 * bar names the forge's condition by its word beside the dot and shows one line of agents and what waits with its figures apart, artboard
 * B1's line, so the bar keeps to one line (D2), with the whole reading of a usage limit hit and since for its tooltip; a value the forge
 * did not report is absent, not zero; an Overseer that stopped answering says its line is as last reported; each condition shows exactly
 * its controls, and a forge whose control contract Gaia does not know cannot be paused, unpaused or stopped from Gaia; the Stop question
 * offers its two choices only while agents run; the area under the bar is the board for a forge read in full or as an Overseer that
 * stopped answering last reported it, and otherwise why it cannot be shown; a refusal is worded with the forge's own sentence.
 */
import { describe, expect, test } from 'bun:test';

import type {
  FleetDocument,
  FleetDocumentCondition,
  FleetDocumentForge,
  FleetDocumentUsage,
} from '../../@types/FleetDocument.ts';
import type { ClockReading } from '../../shared/@types/ClockReading.ts';
import { FLEET_DEGRADED }    from '../../testing/fixtures/fleet-degraded.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeModel } from './ForgeModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const READINGS = FLEET_FIVE_FORGES_READINGS;


const USAGE_UNDER_THE_LIMIT: FleetDocumentUsage = {
  resetsAt:              null,
  window:                null,
  currentWindow:         'five_hour',
  currentWindowResetsAt: '2026-11-12T16:00:00.000Z',
};
const CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

function contentOf(trackerId: string, fleetDocument: FleetDocument = FLEET_FIVE_FORGES) {
  return ForgeModel.forgeContentOf(trackerId, fleetDocument, CLOCK);
}

function withForge(forge: FleetDocumentForge): FleetDocument {
  return { ...FLEET_FIVE_FORGES, forges: [forge] };
}

function words(text: string) {
  return { text, look: 'words' as const };
}

function figure(text: string) {
  return { text, look: 'figure' as const };
}

function barOf(forge: FleetDocumentForge) {
  const { bar } = contentOf(forge.trackerId, withForge(forge));
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

describe('the bar', () => {
  test('of Example Storefront is artboard B1\'s: its word beside the live dot, a line of agents and what waits, and since in the whole reading', () => {
    const bar = barOf(READINGS.exampleStorefront);
    expect(bar.status).toEqual({
      condition: 'live',
      word:      'Live',
      line:      [figure('4 / 5'), words(' agents'), words(' · '), figure('2'), words(' wait on you')],
      text:      '4 / 5 agents · 2 wait on you · since 09:12',
    });
    expect(bar.controlContractIsKnown).toBe(true);
  });

  test('leaves out what the forge did not report, and names no count of agents for a forge Gaia reads nothing of', () => {
    const quiet = barOf({
      ...READINGS.exampleStorefront, attention: [], usage: null, overseerStartedAt: null, concurrency: null,
    });
    expect(quiet.status.text).toBe('4 agents');
    expect(quiet.status.line).toEqual([figure('4'), words(' agents')]);
    expect(barOf(READINGS.designSystem).status).toEqual({
      condition: 'dormant', word: 'Dormant', line: [], text: ''
    });
    expect(barOf(READINGS.legacyImporter).status).toEqual({
      condition: 'missing', word: 'Repository missing', line: [], text: ''
    });
  });

  test('of a forge that stopped answering says its line is as last reported, at the stamp of its last answer', () => {
    const { bar } = contentOf(TRACKER_IDS.invoiceService, FLEET_DEGRADED);
    expect(bar?.status).toEqual({
      condition: 'unreachable',
      word:      'Unreachable',
      line:      [words('as last reported '), figure('13:14'), words(' · '), figure('3 / 5'), words(' agents'), words(' · '), figure('2'), words(' wait on you')],
      text:      'as last reported 13:14 · 3 / 5 agents · 2 wait on you · since 08:40',
    });
  });

  test('of a forge read through its summary counts what waits from its summary', () => {
    const { bar } = contentOf(TRACKER_IDS.researchWiki, FLEET_DEGRADED);
    expect(bar?.status.text).toBe('1 agent · 1 waits on you');
    expect(bar?.status.line).toEqual([figure('1'), words(' agent'), words(' · '), figure('1'), words(' waits on you')]);
    expect(bar?.controlContractIsKnown).toBe(false);
  });

  test('names usage only when its limit was hit, with the clock time it resets and without its window, so the line stays short', () => {
    const limitHit = barOf({ ...READINGS.exampleStorefront, usage: { ...USAGE_UNDER_THE_LIMIT, window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z' } });
    expect(limitHit.status.text).toBe('4 / 5 agents · 2 wait on you · usage limit hit · resets 16:00 · since 09:12');
    expect(limitHit.status.line).toEqual(barOf(READINGS.exampleStorefront).status.line);
    expect(barOf({ ...READINGS.exampleStorefront, usage: USAGE_UNDER_THE_LIMIT }).status.text).not.toContain('usage');
    expect(barOf({ ...READINGS.exampleStorefront, usage: USAGE_UNDER_THE_LIMIT }).status.text).not.toContain('window');
  });

  test('of a forge that stopped answering leaves even a usage limit hit out, so its line keeps as last reported and since', () => {
    const invoiceService = FLEET_DEGRADED.forges.find((forge) => forge.trackerId === TRACKER_IDS.invoiceService);
    if (invoiceService === undefined) throw new Error('The degraded fleet has no Invoice Service.');
    const limitHit = barOf({ ...invoiceService, usage: { ...USAGE_UNDER_THE_LIMIT, window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z' } });
    expect(limitHit.status.text).toBe('as last reported 13:14 · 3 / 5 agents · 2 wait on you · since 08:40');
  });
});

describe('the bar\'s controls for each condition', () => {
  const controlsOf = (condition: FleetDocumentCondition) => {
    const bar = barOf({ ...READINGS.exampleStorefront, condition });
    return { pauseOrUnpause: bar.pauseOrUnpause?.label ?? null, emphasis: bar.pauseOrUnpause?.emphasis ?? null, stop: bar.stop !== null };
  };

  test('live pauses and stops, paused unpauses first and stops, held and unreachable only stop, the others neither', () => {
    expect(controlsOf('live')).toEqual({ pauseOrUnpause: 'Pause', emphasis: 'quiet', stop: true });
    expect(controlsOf('paused')).toEqual({ pauseOrUnpause: 'Unpause', emphasis: 'primary', stop: true });
    expect(controlsOf('held')).toEqual({ pauseOrUnpause: null, emphasis: null, stop: true });
    expect(controlsOf('unreachable')).toEqual({ pauseOrUnpause: null, emphasis: null, stop: true });
    for (const condition of ['passing-baton', 'starting', 'dormant', 'unreadable', 'missing'] as const) {
      expect(controlsOf(condition)).toEqual({ pauseOrUnpause: null, emphasis: null, stop: false });
    }
  });

  test('pause and unpause carry the forge, and a forge whose control contract Gaia does not know is marked so', () => {
    expect(barOf(READINGS.exampleStorefront).pauseOrUnpause?.command).toEqual({ kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront });
    expect(barOf({ ...READINGS.exampleStorefront, condition: 'paused' }).pauseOrUnpause?.command)
      .toEqual({ kind: 'forge-unpause', trackerId: TRACKER_IDS.exampleStorefront });
    const newerControl = { ...READINGS.exampleStorefront, contracts: { ...READINGS.exampleStorefront.contracts, control: 3 } };
    expect(barOf(newerControl).controlContractIsKnown).toBe(false);
  });
});

describe('the Stop question (B2)', () => {
  test('asks about the forge and its running agents, offers both choices with their consequence, and says what keeps waiting', () => {
    expect(barOf(READINGS.exampleStorefront).stop).toEqual({
      label:    'Stop Example Storefront',
      question: 'Stop the Overseer of Example Storefront? 4 agents are running.',
      choices:  [
        {
          agents:      'keep',
          title:       'Stop the Overseer only',
          consequence: 'The 4 agents finish what they are on under Talos. Nothing new starts until this forge is started again.',
        },
        {
          agents:      'stop-first',
          title:       'Stop the agents, then the Overseer',
          consequence: 'The 4 agents wind down first and their tickets return to the board. Then the Overseer stops.',
        },
      ],
      consequence: '2 entries keep waiting on you while it is stopped.',
    });
  });

  test('words one agent and one waiting entry in the singular', () => {
    const { stop } = barOf({
      ...READINGS.exampleStorefront, concurrency: null, agents: READINGS.exampleStorefront.agents.slice(0, 1), attention: []
    });
    expect(stop?.question).toBe('Stop the Overseer of Example Storefront? 1 agent is running.');
    expect(stop?.choices.map((choice) => choice.consequence)).toEqual([
      'The agent finishes what it is on under Talos. Nothing new starts until this forge is started again.',
      'The agent winds down first and its tickets return to the board. Then the Overseer stops.',
    ]);
    expect(stop?.consequence).toBeNull();
  });

  test('has no choices when no agent runs', () => {
    const { stop } = barOf({ ...READINGS.exampleStorefront, concurrency: null, agents: [] });
    expect(stop?.question).toBe('Stop the Overseer of Example Storefront?');
    expect(stop?.choices).toEqual([]);
  });
});

describe('the area under the bar', () => {
  test('is the board of a forge read in full, and of one whose Overseer stopped answering, as last reported', () => {
    expect(contentOf(TRACKER_IDS.exampleStorefront).area).toEqual({ kind: 'board', trackerId: TRACKER_IDS.exampleStorefront, project: 'Example Storefront' });
    expect(contentOf(TRACKER_IDS.invoiceService, FLEET_DEGRADED).area).toEqual({ kind: 'board', trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service' });
  });

  test('cannot show a forge read through its summary, newer than Gaia, dormant or gone', () => {
    const kinds = [
      contentOf(TRACKER_IDS.researchWiki, FLEET_DEGRADED).area.kind,
      contentOf('analytics-sandbox-4d18', FLEET_DEGRADED).area.kind,
      contentOf(TRACKER_IDS.designSystem).area.kind,
      contentOf(TRACKER_IDS.legacyImporter).area.kind,
    ];
    expect(kinds).toEqual(['cannot-show', 'cannot-show', 'cannot-show', 'cannot-show']);
  });

  test('a tracker id the registry does not name has no bar and says so', () => {
    expect(contentOf('example-unknown-0000')).toEqual({ bar: null, area: { kind: 'not-registered', trackerId: 'example-unknown-0000' } });
  });
});

describe('a refusal under the bar', () => {
  const refused = {
    answerVersion: 3, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.', forges: []
  } as const;

  test('names the bar\'s command and shows the forge\'s code and sentence; Stop asks its question again rather than resending', () => {
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } })).toEqual({
      refusedBy:    'forge',
      commandLabel: 'Stop',
      code:         'overseer-still-live',
      sentence:     'The Overseer did not stop within its tries.',
      tryAgain:     null,
    });
  });

  test('sends pause again as it was', () => {
    const pauseRefusal = ForgeModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-pause', result: { verdict: 'server-unreachable' } });
    expect(pauseRefusal).toEqual({
      refusedBy:    'gaia',
      commandLabel: 'Pause',
      code:         'server-unreachable',
      sentence:     'Gaia\'s server could not be reached.',
      tryAgain:     { kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront },
    });
  });

  test('is absent with no failure, and for a command that names no forge', () => {
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleStorefront, null)).toBeNull();
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'fleet-look-again', result: { verdict: 'server-unreachable' } })).toBeNull();
  });
});

describe('the bar of a forge holding agents a network outage stopped', () => {
  test('shows its own count after what waits, in the line and in the whole reading', () => {
    const bar = barOf({ ...READINGS.exampleStorefront, outageEndings: 2 });
    expect(bar.status.line).toEqual([
      figure('4 / 5'), words(' agents'), words(' · '), figure('2'), words(' wait on you'), words(' · '), figure('2'), words(' stopped on an outage'),
    ]);
    expect(bar.status.text).toBe('4 / 5 agents · 2 wait on you · 2 stopped on an outage · since 09:12');
  });
});
