/**
 * What a forge in place shows of a fleet document. What matters (SCREENS B1, with A4's buttons per condition and B2's Stop question): the
 * bar names the forge's condition by its word beside the dot and prints one mono line of agents, what waits, usage and since, the one of
 * artboard B1 for Example Storefront; a value the forge did not report is absent, not zero; an Overseer that stopped answering says its
 * line is as last reported; each condition shows exactly its controls, and a forge whose control contract Gaia does not know cannot be
 * paused, resumed or stopped from Gaia; the Stop question offers its two choices only while agents run; the frame area is the Bridge only
 * for a forge read in full with the embed channel Gaia knows, B3's callout for one that stopped answering, and otherwise why it cannot be
 * shown; a new address or start of the Overseer is a new frame session; `leave` goes back to the view Gaia came from; a refusal is worded
 * with the forge's own sentence.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentCondition, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import { HashRouter }                                                     from '../../shell/HashRouter.ts';
import { FLEET_DEGRADED }                                                 from '../../testing/fixtures/fleet-degraded.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { type ForgeFrameClock, ForgeFrameModel } from './ForgeFrameModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const READINGS = FLEET_FIVE_FORGES_READINGS;

const CLOCK: ForgeFrameClock = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

function contentOf(trackerId: string, fleetDocument: FleetDocument = FLEET_FIVE_FORGES) {
  return ForgeFrameModel.forgeFrameContentOf(trackerId, fleetDocument, CLOCK);
}

function withForge(forge: FleetDocumentForge): FleetDocument {
  return { ...FLEET_FIVE_FORGES, forges: [forge] };
}

function barOf(forge: FleetDocumentForge) {
  const { bar } = contentOf(forge.trackerId, withForge(forge));
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

describe('the bar', () => {
  test('of Example Storefront is artboard B1\'s: its word beside the live dot and one mono line of agents, what waits, usage and since', () => {
    const bar = barOf(READINGS.exampleStorefront);
    expect(bar.status).toEqual({ condition: 'live', word: 'Live', text: '4 / 5 agents · 2 wait on you · usage under its limit · since 09:12' });
    expect(bar.openInNewTab).toEqual({ kind: 'forge-open-in-browser', trackerId: TRACKER_IDS.exampleStorefront });
    expect(bar.controlContractIsKnown).toBe(true);
  });

  test('leaves out what the forge did not report, and names no count of agents for a forge Gaia reads nothing of', () => {
    const quiet = barOf({
      ...READINGS.exampleStorefront, attention: [], usage: null, overseerStartedAt: null, concurrency: null,
    });
    expect(quiet.status.text).toBe('4 agents');
    expect(barOf(READINGS.designSystem).status).toEqual({ condition: 'dormant', word: 'Dormant', text: '' });
    expect(barOf(READINGS.legacyImporter).status).toEqual({ condition: 'missing', word: 'Repository missing', text: '' });
  });

  test('of a forge that stopped answering says its line is as last reported, at the stamp of its last answer', () => {
    const { bar } = contentOf(TRACKER_IDS.invoiceService, FLEET_DEGRADED);
    expect(bar?.status).toEqual({
      condition: 'unreachable',
      word:      'Unreachable',
      text:      'as last reported 13:14 · 3 / 5 agents · 2 wait on you · usage under its limit · since 08:40',
    });
  });

  test('of a forge read through its summary counts what waits from its summary', () => {
    const { bar } = contentOf(TRACKER_IDS.researchWiki, FLEET_DEGRADED);
    expect(bar?.status.text).toBe('1 agent · 1 waits on you · usage under its limit');
    expect(bar?.controlContractIsKnown).toBe(false);
  });

  test('prints a usage limit that was hit with its window and the clock time it resets', () => {
    const limitHit = barOf({ ...READINGS.exampleStorefront, usage: { window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z' } });
    expect(limitHit.status.text).toBe('4 / 5 agents · 2 wait on you · usage five-hour limit hit · resets 16:00 · since 09:12');
  });
});

describe('the bar\'s controls for each condition', () => {
  const controlsOf = (condition: FleetDocumentCondition) => {
    const bar = barOf({ ...READINGS.exampleStorefront, condition });
    return { pauseOrResume: bar.pauseOrResume?.label ?? null, emphasis: bar.pauseOrResume?.emphasis ?? null, stop: bar.stop !== null };
  };

  test('live pauses and stops, paused resumes first and stops, held and unreachable only stop, the others neither', () => {
    expect(controlsOf('live')).toEqual({ pauseOrResume: 'Pause', emphasis: 'plain', stop: true });
    expect(controlsOf('paused')).toEqual({ pauseOrResume: 'Resume', emphasis: 'primary', stop: true });
    expect(controlsOf('held')).toEqual({ pauseOrResume: null, emphasis: null, stop: true });
    expect(controlsOf('unreachable')).toEqual({ pauseOrResume: null, emphasis: null, stop: true });
    for (const condition of ['passing-baton', 'starting', 'dormant', 'unreadable', 'missing'] as const) {
      expect(controlsOf(condition)).toEqual({ pauseOrResume: null, emphasis: null, stop: false });
    }
  });

  test('pause and resume carry the forge, and a forge whose control contract Gaia does not know is marked so', () => {
    expect(barOf(READINGS.exampleStorefront).pauseOrResume?.command).toEqual({ kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront });
    expect(barOf({ ...READINGS.exampleStorefront, condition: 'paused' }).pauseOrResume?.command)
      .toEqual({ kind: 'forge-resume', trackerId: TRACKER_IDS.exampleStorefront });
    const newerControl = { ...READINGS.exampleStorefront, contracts: { ...READINGS.exampleStorefront.contracts, control: 2 } };
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
          consequence: 'The 4 agents finish what they are on under their Watchers. Nothing new starts until this forge is started again.',
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
      'The agent finishes what it is on under its Watcher. Nothing new starts until this forge is started again.',
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

describe('the frame area', () => {
  test('frames the Bridge of a forge read in full with the embed channel Gaia knows, keyed by its Overseer', () => {
    const { area } = contentOf(TRACKER_IDS.exampleStorefront);
    expect(area).toMatchObject({
      kind: 'frame', trackerId: TRACKER_IDS.exampleStorefront, project: 'Example Storefront', overseerKey: 'http://127.0.0.1:4951 2026-11-12T09:12:00.000Z',
    });
  });

  test('a new address or a new start of the Overseer is a new key, so a new frame session', () => {
    const keyOf = (forge: FleetDocumentForge): string => {
      const { area } = contentOf(forge.trackerId, withForge(forge));
      return area.kind === 'frame' ? area.overseerKey : 'no frame';
    };
    const before = keyOf(READINGS.exampleStorefront);
    expect(keyOf({ ...READINGS.exampleStorefront, url: 'http://127.0.0.1:4999' })).not.toBe(before);
    expect(keyOf({ ...READINGS.exampleStorefront, overseerStartedAt: '2026-11-12T13:30:00.000Z' })).not.toBe(before);
    expect(keyOf({ ...READINGS.exampleStorefront, attention: [] })).toBe(before);
  });

  test('shows B3\'s callout for an Overseer that stopped answering, with its address, process and last answer', () => {
    expect(contentOf(TRACKER_IDS.invoiceService, FLEET_DEGRADED).area).toEqual({
      kind:      'unreachable',
      trackerId: TRACKER_IDS.invoiceService,
      project:   'Invoice Service',
      callout:   {
        word:        'Unreachable',
        sentence:    'Its Overseer stopped answering. The registry still names it.',
        machineLine: '127.0.0.1:4957 · process 48211 · last answer 13:14',
      },
    });
  });

  test('cannot show a forge without the embed channel Gaia knows, read through its summary, newer than Gaia, dormant or gone', () => {
    const noEmbed = { ...READINGS.exampleStorefront, contracts: { ...READINGS.exampleStorefront.contracts, embed: null } };
    const newerEmbed = { ...READINGS.exampleStorefront, contracts: { ...READINGS.exampleStorefront.contracts, embed: 2 } };
    const kinds = [
      contentOf(noEmbed.trackerId, withForge(noEmbed)).area.kind,
      contentOf(newerEmbed.trackerId, withForge(newerEmbed)).area.kind,
      contentOf(TRACKER_IDS.researchWiki, FLEET_DEGRADED).area.kind,
      contentOf('analytics-sandbox-4d18', FLEET_DEGRADED).area.kind,
      contentOf(TRACKER_IDS.designSystem).area.kind,
      contentOf(TRACKER_IDS.legacyImporter).area.kind,
    ];
    expect(kinds).toEqual(['cannot-show', 'cannot-show', 'cannot-show', 'cannot-show', 'cannot-show', 'cannot-show']);
  });

  test('a tracker id the registry does not name has no bar and says so', () => {
    expect(contentOf('example-unknown-0000')).toEqual({ bar: null, area: { kind: 'not-registered', trackerId: 'example-unknown-0000' } });
  });
});

describe('where leave goes', () => {
  const attention = HashRouter.routeOf('#attention');
  const agentsWithFilters = HashRouter.routeOf('#agents?role=builders');
  const storefrontQuestions = HashRouter.routeOf(`#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`);
  const storefrontKanban = HashRouter.routeOf(`#forge/${TRACKER_IDS.exampleStorefront}/#kanban`);
  const invoiceInPlace = HashRouter.routeOf(`#forge/${TRACKER_IDS.invoiceService}`);

  test('back to the view the forge was entered from, its filters kept, also after moving inside the forge', () => {
    const entered = ForgeFrameModel.leaveTargetAfter(ForgeFrameModel.initialLeaveTarget(agentsWithFilters), storefrontQuestions);
    expect(entered.fragment).toBe('#agents?role=builders');
    expect(ForgeFrameModel.leaveTargetAfter(entered, storefrontKanban).fragment).toBe('#agents?role=builders');
  });

  test('from one forge to another, back to the first', () => {
    const inStorefront = ForgeFrameModel.leaveTargetAfter(ForgeFrameModel.initialLeaveTarget(attention), storefrontQuestions);
    expect(ForgeFrameModel.leaveTargetAfter(inStorefront, invoiceInPlace).fragment).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`);
  });

  test('to Attention for a page opened at the forge, and the same target, the very object, for the same route', () => {
    const opened = ForgeFrameModel.initialLeaveTarget(storefrontQuestions);
    expect(opened.fragment).toBe('#attention');
    expect(ForgeFrameModel.leaveTargetAfter(opened, storefrontQuestions)).toBe(opened);
  });
});

describe('a refusal under the bar', () => {
  const refused = {
    answerVersion: 1, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.'
  } as const;

  test('names the bar\'s command and shows the forge\'s code and sentence; Stop asks its question again rather than resending', () => {
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } })).toEqual({
      commandLabel: 'Stop', code: 'overseer-still-live', sentence: 'The Overseer did not stop within its tries.', tryAgain: null,
    });
  });

  test('sends pause, resume and Open in new tab again as they were', () => {
    const pauseRefusal = ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-pause', result: { verdict: 'server-unreachable' } });
    expect(pauseRefusal).toEqual({
      commandLabel: 'Pause',
      code:         'server-unreachable',
      sentence:     'Gaia\'s server could not be reached.',
      tryAgain:     { kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront },
    });
    const openRefusal = ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-open-in-browser', result: { verdict: 'answered', answer: refused } });
    expect(openRefusal?.tryAgain).toEqual({ kind: 'forge-open-in-browser', trackerId: TRACKER_IDS.exampleStorefront });
  });

  test('is absent with no failure, and for a command that names no forge', () => {
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, null)).toBeNull();
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'fleet-look-again', result: { verdict: 'server-unreachable' } })).toBeNull();
  });
});

describe('the reason there is no frame session', () => {
  test('is the forge\'s own sentence when it sent one, else Gaia\'s for its own code, else a plain one', () => {
    expect(ForgeFrameModel.frameSessionRefusalTextOf('sessions-full', 'The Overseer holds as many sessions as it allows.'))
      .toEqual({ code: 'sessions-full', sentence: 'The Overseer holds as many sessions as it allows.' });
    expect(ForgeFrameModel.frameSessionRefusalTextOf('token-rejected', null)).toEqual({ code: 'token-rejected', sentence: 'The forge did not accept Gaia\'s token.' });
    expect(ForgeFrameModel.frameSessionRefusalTextOf('server-unreachable', null).sentence).toBe('Gaia\'s server could not be reached.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('session-lost-while-opening', null).sentence).toBe('The Bridge lost its session as it opened.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('constructor', null).sentence).toBe('Gaia could not open a session in this forge.');
  });
});
