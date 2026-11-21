/**
 * What a forge in place shows of a fleet document. What matters (SCREENS B1, with A4's buttons per condition and B2's Stop question): the
 * bar names the forge's condition by its word beside the dot and shows one line of agents and what waits with its figures apart, artboard
 * B1's line, so the bar keeps to one line (D2), with the whole reading of a usage limit hit and since for its tooltip; a value the forge
 * did not report is absent, not zero; an Overseer that stopped answering says its line is as last reported; each condition shows exactly
 * its controls, and a forge whose control contract Gaia does not know cannot be paused, resumed or stopped from Gaia; the Stop question
 * offers its two choices only while agents run; the frame area is the Bridge only for a forge read in full with the embed channel Gaia
 * knows, B3's callout for one that stopped answering, and otherwise why it cannot be shown; a new address or start of the Overseer is a new
 * frame session; `leave` goes back to the view Gaia came from; a refusal is worded with the forge's own sentence.
 * Flint's brain: each state the forge reports is worded for the bar, the time left counted down to the forge's `endsAt` and never ending
 * the brain by itself; it is absent under a monitor older than contract 3 and for a forge without Flint, both reported as `not-reported`;
 * its controls are served only by an Overseer that answers, at a control contract that carries them; a wake refused here shows in the
 * brain's group, not under the bar, and only until the forge reports the brain waking or awake.
 */
import { describe, expect, test } from 'bun:test';

import type {
  FleetDocument,
  FleetDocumentBrain,
  FleetDocumentCondition,
  FleetDocumentForge,
  FleetDocumentUsage,
} from '../../@types/FleetDocument.ts';
import type { CommandFailure } from '../../api/CommandSender.ts';
import type { ClockReading }   from '../../shared/@types/ClockReading.ts';
import { HashRouter }          from '../../shared/HashRouter.ts';
import { STOREFRONT_BRAINS }   from '../../testing/fixtures/fleet-brain-states.ts';
import { FLEET_DEGRADED }      from '../../testing/fixtures/fleet-degraded.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeFrameModel } from './ForgeFrameModel.ts';

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
  return ForgeFrameModel.forgeFrameContentOf(trackerId, fleetDocument, CLOCK);
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
    return { pauseOrResume: bar.pauseOrResume?.label ?? null, emphasis: bar.pauseOrResume?.emphasis ?? null, stop: bar.stop !== null };
  };

  test('live pauses and stops, paused resumes first and stops, held and unreachable only stop, the others neither', () => {
    expect(controlsOf('live')).toEqual({ pauseOrResume: 'Pause', emphasis: 'quiet', stop: true });
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
  const storefrontQuestions = HashRouter.routeOf(`#forge/${TRACKER_IDS.exampleStorefront}/questions/E2`);
  const storefrontKanban = HashRouter.routeOf(`#forge/${TRACKER_IDS.exampleStorefront}/kanban`);
  const invoiceInPlace = HashRouter.routeOf(`#forge/${TRACKER_IDS.invoiceService}`);

  test('back to the view the forge was entered from, its filters kept, also after moving inside the forge', () => {
    const entered = ForgeFrameModel.leaveTargetAfter(ForgeFrameModel.initialLeaveTarget(agentsWithFilters), storefrontQuestions);
    expect(entered.fragment).toBe('#agents?role=builders');
    expect(ForgeFrameModel.leaveTargetAfter(entered, storefrontKanban).fragment).toBe('#agents?role=builders');
  });

  test('from one forge to another, back to the first', () => {
    const inStorefront = ForgeFrameModel.leaveTargetAfter(ForgeFrameModel.initialLeaveTarget(attention), storefrontQuestions);
    expect(ForgeFrameModel.leaveTargetAfter(inStorefront, invoiceInPlace).fragment).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/questions/E2`);
  });

  test('to Attention for a page opened at the forge, and the same target, the very object, for the same route', () => {
    const opened = ForgeFrameModel.initialLeaveTarget(storefrontQuestions);
    expect(opened.fragment).toBe('#attention');
    expect(ForgeFrameModel.leaveTargetAfter(opened, storefrontQuestions)).toBe(opened);
  });
});

describe('a refusal under the bar', () => {
  const refused = {
    answerVersion: 3, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.'
  } as const;

  test('names the bar\'s command and shows the forge\'s code and sentence; Stop asks its question again rather than resending', () => {
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } })).toEqual({
      refusedBy:    'forge',
      commandLabel: 'Stop',
      code:         'overseer-still-live',
      sentence:     'The Overseer did not stop within its tries.',
      tryAgain:     null,
    });
  });

  test('sends pause, resume and Open in new tab again as they were', () => {
    const pauseRefusal = ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, { kind: 'forge-pause', result: { verdict: 'server-unreachable' } });
    expect(pauseRefusal).toEqual({
      refusedBy:    'gaia',
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

describe('Flint\'s brain in the bar', () => {
  const MILLISECONDS_PER_SECOND = 1000;

  /** Example Storefront at the control contract Gaia sends, unless the overrides say otherwise. */
  function brainOf(brain: FleetDocumentBrain | 'not-reported', overrides: Partial<FleetDocumentForge> = {}, clock: ClockReading = CLOCK) {
    const storefront = READINGS.exampleStorefront;
    const forge = {
      ...storefront, contracts: { ...storefront.contracts, control: 1 }, brain, ...overrides,
    };
    const { bar } = ForgeFrameModel.forgeFrameContentOf(forge.trackerId, withForge(forge), clock);
    if (bar === null) throw new Error('The forge has no bar.');
    return bar.brain;
  }

  function clockLaterBy(seconds: number): ClockReading {
    return { ...CLOCK, nowEpochMilliseconds: CLOCK.nowEpochMilliseconds + seconds * MILLISECONDS_PER_SECOND };
  }

  test('words each state B1 draws, the running brain\'s figures as the forge reports them and its time left to the forge\'s end', () => {
    expect(brainOf(STOREFRONT_BRAINS.off)).toEqual({ shown: { state: 'off' }, controlsAreServed: true });
    expect(brainOf(STOREFRONT_BRAINS.starting)?.shown).toEqual({ state: 'starting' });
    expect(brainOf(STOREFRONT_BRAINS.running)?.shown).toEqual({
      state: 'running', model: 'haiku', effort: 'low', countdown: '1:24', tokens: '3.1k',
    });
    expect(brainOf(STOREFRONT_BRAINS.refused)?.shown).toEqual({
      state: 'refused', refusedBy: 'forge', code: 'usage-limit-holds', sentence: 'launches are held until 16:00 (usage limit)'
    });
    expect(brainOf(STOREFRONT_BRAINS.ended)?.shown).toEqual({ state: 'ended', sentence: 'Flint\'s brain stopped after 2:00 · 4.2k tokens' });
  });

  test('counts the time left down with the page\'s clock, its part second dropped as in every view, and stays at 0:00 running until the forge reports the brain ended', () => {
    const countdownAt = (seconds: number) => {
      const shown = brainOf(STOREFRONT_BRAINS.running, {}, clockLaterBy(seconds))?.shown;
      return shown?.state === 'running' ? shown.countdown : shown?.state;
    };
    expect([countdownAt(0), countdownAt(0.4), countdownAt(30), countdownAt(83.5), countdownAt(84), countdownAt(600)]).toEqual(['1:24', '1:23', '0:54', '0:00', '0:00', '0:00']);
  });

  test('a figure the forge did not report reads as a dash, never as zero', () => {
    const unreported = {
      ...STOREFRONT_BRAINS.running, model: null, effort: null, tokens: null, endsAt: null
    };
    expect(brainOf(unreported)?.shown).toEqual({
      state: 'running', model: '–', effort: '–', countdown: '–', tokens: '–',
    });
  });

  test('a refusal or an end whose sentence names a command is worded by Gaia from its code and tokens', () => {
    const refusedWithoutSentence = { ...STOREFRONT_BRAINS.refused, refusal: { code: 'overseer-paused', sentence: null } };
    expect(brainOf(refusedWithoutSentence)?.shown).toEqual({
      state: 'refused', refusedBy: 'forge', code: 'overseer-paused', sentence: 'the Overseer is paused'
    });
    const unknownCode = { ...STOREFRONT_BRAINS.refused, refusal: { code: 'constructor', sentence: null } };
    expect(brainOf(unknownCode)?.shown).toEqual({
      state: 'refused', refusedBy: 'forge', code: 'constructor', sentence: 'Flint\'s brain did not wake'
    });
    expect(brainOf({ ...STOREFRONT_BRAINS.ended, sentence: null })?.shown).toEqual({ state: 'ended', sentence: 'Flint\'s brain stopped · 4.2k tokens' });
  });

  test('is absent under a monitor older than contract 3 and for a forge without Flint, which both report no brain', () => {
    expect(brainOf('not-reported', { contracts: { ...READINGS.exampleStorefront.contracts, monitor: 2 } })).toBeNull();
    expect(brainOf('not-reported', { contracts: { ...READINGS.exampleStorefront.contracts, monitor: 1 } })).toBeNull();
    expect(brainOf('not-reported')).toBeNull();
  });

  test('takes Wake and Stop only at the control contract Gaia sends, never under another number or none', () => {
    const servedAt = (control: number | null) => brainOf(STOREFRONT_BRAINS.running, { contracts: { ...READINGS.exampleStorefront.contracts, control } })?.controlsAreServed;
    expect([servedAt(1), servedAt(2), servedAt(3), servedAt(null)]).toEqual([true, false, false, false]);
  });

  test('takes neither from an Overseer that stopped answering, whose brain shows as last reported', () => {
    expect(brainOf(STOREFRONT_BRAINS.running, { fidelity: 'unreachable', condition: 'unreachable' })).toEqual({
      shown: {
        state: 'running', model: 'haiku', effort: 'low', countdown: '1:24', tokens: '3.1k'
      },
      controlsAreServed: false,
    });
  });

  test('a wake refused here replaces off, refused and ended in the group, a refused stop does not, and neither shows under the bar as well', () => {
    const wakeRefused = { kind: 'forge-brain-start', result: { verdict: 'server-unreachable' } } as const;
    const stopRefused = { kind: 'forge-brain-stop', result: { verdict: 'server-unreachable' } } as const;
    const refusedHere = {
      state: 'refused', refusedBy: 'gaia', code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.'
    } as const;
    for (const state of ['off', 'refused', 'ended'] as const) {
      const brain = brainOf(STOREFRONT_BRAINS[state]);
      if (brain === null) throw new Error('The forge has no brain.');
      expect(ForgeFrameModel.brainShownAfter(brain, wakeRefused)).toEqual(refusedHere);
      expect(ForgeFrameModel.brainShownAfter(brain, stopRefused)).toBe(brain.shown);
    }
    const running = brainOf(STOREFRONT_BRAINS.running);
    if (running === null) throw new Error('The forge has no brain.');
    expect(ForgeFrameModel.brainShownAfter(running, wakeRefused)).toBe(running.shown);
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, wakeRefused)).toBeNull();
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleStorefront, stopRefused)).toEqual({
      refusedBy:    'gaia',
      commandLabel: 'Stop Flint\'s brain',
      code:         'server-unreachable',
      sentence:     'Gaia\'s server could not be reached.',
      tryAgain:     { kind: 'forge-brain-stop', trackerId: TRACKER_IDS.exampleStorefront },
    });
  });

  test('a wake refused here lasts only until the forge reports its brain waking or awake, so the forge\'s own later end shows', () => {
    const wakeRefused = { kind: 'forge-brain-start', result: { verdict: 'server-unreachable' } } as const;
    let failure: CommandFailure | null = wakeRefused;
    const shownStates = (['off', 'running', 'ended'] as const).map((state) => {
      const brain = brainOf(STOREFRONT_BRAINS[state]);
      if (brain === null) throw new Error('The forge has no brain.');
      if (ForgeFrameModel.brainWakeRefusalIsOutOfDate(brain, failure)) failure = null;
      return ForgeFrameModel.brainShownAfter(brain, failure).state;
    });
    expect(shownStates).toEqual(['refused', 'running', 'ended']);
  });

  test('a wake refused here with no sentence is worded as the forge\'s own brain refusal of that code, never as a bare refusal', () => {
    const brain = brainOf(STOREFRONT_BRAINS.off);
    if (brain === null) throw new Error('The forge has no brain.');
    const refusedWithoutText = (refusal: string) => ({
      kind:   'forge-brain-start',
      result: {
        verdict: 'answered',
        answer:  {
          answerVersion: 3, outcome: 'refused', refusal, text: null,
        },
      },
    } as const);
    const usageLimit = {
      state: 'refused', refusedBy: 'forge', code: 'usage-limit-holds', sentence: 'launches are held until the usage limit resets'
    } as const;
    const exampleRefusal = {
      state: 'refused', refusedBy: 'forge', code: 'example-refusal', sentence: 'Flint\'s brain did not wake'
    } as const;
    expect(ForgeFrameModel.brainShownAfter(brain, refusedWithoutText('usage-limit-holds'))).toEqual(usageLimit);
    expect(ForgeFrameModel.brainShownAfter(brain, refusedWithoutText('example-refusal'))).toEqual(exampleRefusal);
  });

  test('the mark wakes the brain only where Wake shows, and its title says so or says how the brain is', () => {
    const markOf = (brain: FleetDocumentBrain | 'not-reported', control: number | null = 1) => {
      const barBrain = brainOf(brain, { contracts: { ...READINGS.exampleStorefront.contracts, control } });
      return ForgeFrameModel.markWakeOf(barBrain, barBrain?.shown ?? null);
    };
    const wakes = { title: 'Double-click to wake Flint\'s brain', wakesBrain: true };
    expect(markOf(STOREFRONT_BRAINS.off)).toEqual(wakes);
    expect(markOf(STOREFRONT_BRAINS.refused)).toEqual(wakes);
    expect(markOf(STOREFRONT_BRAINS.ended)).toEqual(wakes);
    expect(markOf(STOREFRONT_BRAINS.starting)).toEqual({ title: 'Flint\'s brain is waking', wakesBrain: false });
    expect(markOf(STOREFRONT_BRAINS.running)).toEqual({ title: 'Flint\'s brain is awake', wakesBrain: false });
    expect(markOf(STOREFRONT_BRAINS.off, 3)).toEqual({ title: null, wakesBrain: false });
    expect(markOf('not-reported')).toEqual({ title: null, wakesBrain: false });
  });
});

describe('the reason there is no frame session', () => {
  test('is the forge\'s own sentence when it sent one, else Gaia\'s for its own code, else a plain one', () => {
    expect(ForgeFrameModel.frameSessionRefusalTextOf('sessions-full', 'The Overseer holds as many sessions as it allows.'))
      .toEqual({ refusedBy: 'forge', code: 'sessions-full', sentence: 'The Overseer holds as many sessions as it allows.' });
    expect(ForgeFrameModel.frameSessionRefusalTextOf('token-rejected', null))
      .toEqual({ refusedBy: 'gaia', code: 'token-rejected', sentence: 'The forge did not accept Gaia\'s token.' });
    expect(ForgeFrameModel.frameSessionRefusalTextOf('server-unreachable', null).sentence).toBe('Gaia\'s server could not be reached.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('session-lost-while-opening', null).sentence).toBe('The Bridge lost its session as it opened.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('constructor', null).sentence).toBe('Gaia could not open a session in this forge.');
  });

  test('names a registry Gaia cannot read, or one newer than it reads, apart from a registry that does not name the forge', () => {
    expect(ForgeFrameModel.frameSessionRefusalTextOf('registry-unreadable', null).sentence).toBe('Gaia could not read the forges\' registry.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('registry-newer-version', null).sentence).toBe('The forges\' registry is newer than this Gaia reads.');
    expect(ForgeFrameModel.frameSessionRefusalTextOf('forge-not-registered', null).sentence).toBe('The registry does not name this forge.');
  });
});
