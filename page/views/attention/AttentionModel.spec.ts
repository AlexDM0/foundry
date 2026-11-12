/**
 * What the Attention view shows of a fleet document. What matters (SCREENS A1, B3, B4): with `fleet-five-forges` the list holds the five
 * rows of A1 in the fleet's order, each with its forge, kind, id, subject, meta line, age and the forge's route in place, the first row's
 * button the only primary; an age is printed from the page's clock and no order depends on it; nothing waiting says so and keeps the
 * figures; the forges that need a look carry PLAN 7.2's actions, the machine's limit never among them. B3: the head and the figure say
 * "more possible", an unreachable forge's rows are read as last reported and cannot act, its banner and callout name what Gaia last saw,
 * every figure comes from the document and the forges it cannot vouch for are named in the side panel, and a forge that answers again is
 * read normally. B4: no forge gives its own screen, and the forge program is missing only when neither the settings nor Gaia know one.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import { FLEET_AT_LIMIT }                         from '../../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                         from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                            from '../../testing/fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import {
  type AttentionContent,
  AttentionModel,
  type ClockReading,
  type LookCallout,
  type NoForgeContent,
} from './AttentionModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const ANALYTICS_SANDBOX_TRACKER_ID = 'analytics-sandbox-4d18';

const ARTBOARD_CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

function fleetContentOf(fleetDocument: FleetDocument, clock: ClockReading = ARTBOARD_CLOCK): AttentionContent {
  const screen = AttentionModel.screenOf(fleetDocument, clock);
  if (screen.kind !== 'fleet') throw new Error('Expected the fleet screen.');
  return screen.content;
}

function noForgeContentOf(fleetDocument: FleetDocument): NoForgeContent {
  const screen = AttentionModel.screenOf(fleetDocument, ARTBOARD_CLOCK);
  if (screen.kind !== 'no-forge') throw new Error('Expected the no-forge screen.');
  return screen.content;
}

function lookOf(content: AttentionContent, trackerId: string): LookCallout {
  const look = content.looks.find((candidate) => candidate.trackerId === trackerId);
  if (look === undefined) throw new Error(`No callout for ${trackerId}.`);
  return look;
}

function actionsOf(look: LookCallout) {
  return look.actions.map((action) => (action.kind === 'link'
    ? [action.label, action.emphasis, action.href]
    : [action.label, action.emphasis, action.command, action.forgeAcceptsIt]));
}

describe('what waits on User (A1)', () => {
  test('with fleet-five-forges the list holds the five rows of the artboard in its order', () => {
    const { rows, waitingHead } = fleetContentOf(FLEET_FIVE_FORGES);
    expect(waitingHead).toBe('Waiting on you · 5');
    expect(rows.map((row) => [row.project, row.kindText, row.kindTone, row.idText, row.subject, row.metaText, row.actionLabel])).toEqual([
      ['Invoice Service', 'Escalated', 'error', 'E4', 'The VAT gate cannot run in the sandbox. Allow network for it?', 'from incident I2 · opened 21m', 'Answer'],
      ['Example Storefront', 'Draft', 'attention', '#015', 'Search suggestions', 'filed by intake · filed 2h 04m', 'Ready'],
      ['Research Wiki', 'Question', 'attention', 'E1', 'Two gates are proposed for this repository. Accept them?', 'pipeline-proposal · opened 26m', 'Answer'],
      ['Invoice Service', 'Accept', 'attention', '#031', 'Round VAT per line, not per invoice', 'merges clean into main · reviewed 12m', 'Accept'],
      ['Example Storefront', 'Question', 'attention', 'E2', 'How long should a password reset link stay valid?', 'asked by J3 builder · opened 4m', 'Answer'],
    ]);
  });

  test('each row shows its forge\'s dot and condition word, and only the first row\'s button is primary', () => {
    const { rows } = fleetContentOf(FLEET_FIVE_FORGES);
    expect(rows.map((row) => [row.condition, row.conditionWord, row.isStale])).toEqual(Array.from({ length: 5 }, () => ['live', 'live', false]));
    expect(rows.map((row) => row.isPrimary)).toEqual([true, false, false, false, false]);
  });

  test('the Answer button of E2 goes to Example Storefront in place at #questions/E2', () => {
    const answerOnE2 = fleetContentOf(FLEET_FIVE_FORGES).rows.find((row) => row.idText === 'E2');
    expect(answerOnE2?.href).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`);
  });

  test('an age is printed from the page\'s clock, and the order is the document\'s whatever the clock reads', () => {
    const anHourLater: ClockReading = { ...ARTBOARD_CLOCK, nowEpochMilliseconds: ARTBOARD_CLOCK.nowEpochMilliseconds + 3_600_000 };
    const atTheArtboard = fleetContentOf(FLEET_FIVE_FORGES).rows;
    const later = fleetContentOf(FLEET_FIVE_FORGES, anHourLater).rows;
    expect(later.map((row) => row.key)).toEqual(atTheArtboard.map((row) => row.key));
    expect(later.map((row) => row.metaText.split(' · ').at(-1))).toEqual(['opened 1h 21m', 'filed 3h 04m', 'opened 1h 26m', 'reviewed 1h 12m', 'opened 1h 04m']);
    const reversed = { ...FLEET_FIVE_FORGES, attention: [...FLEET_FIVE_FORGES.attention].reverse() };
    expect(fleetContentOf(reversed).rows.map((row) => row.idText)).toEqual(['E2', '#031', 'E1', '#015', 'E4']);
  });

  test('with nothing waiting the list\'s place says so, and the figures stay', () => {
    const nothingWaits: FleetDocument = { ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } };
    const content = fleetContentOf(nothingWaits);
    expect([content.rows, content.nothingText, content.waitingHead]).toEqual([[], 'Nothing waits on you.', 'Waiting on you · 0']);
    expect(content.figures.map((figure) => figure.label)).toEqual(['waiting on you', 'agents, machine limit', 'tickets ready', 'done today', 'tokens today', 'open incidents']);
  });
});

describe('the status line and the figures', () => {
  test('count the forges by condition, and print each figure of the document', () => {
    const content = fleetContentOf(FLEET_FIVE_FORGES);
    expect(content.status).toEqual({ condition: 'live', text: '4 forges running, 1 holds its launches · 1 dormant · 1 repository missing' });
    expect(content.figures.map((figure) => figure.value)).toEqual(['5', '10 / 12', '11', '6', '1.24M', '0']);
  });

  test('name a paused, starting or unreadable forge, and leave out a hidden one', () => {
    const paused = AttentionModel.statusLineOf(FLEET_AT_LIMIT);
    expect(paused.text).toBe('4 forges running, 1 paused, 1 holds its launches · 1 starting · 1 repository missing');
    const hidden = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.legacyImporter] } };
    expect(AttentionModel.statusLineOf(hidden).text).toBe('4 forges running, 1 holds its launches · 1 dormant');
    const everyForgeHidden = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: Object.values(TRACKER_IDS) } };
    expect(AttentionModel.statusLineOf(everyForgeHidden)).toEqual({ condition: null, text: 'every forge is hidden in Gaia' });
  });

  test('print a count by its significant digits, and an unknown machine limit as the agents alone', () => {
    expect([840, 41_300, 512_000, 999_999, 1_240_000, 12_400_000].map(AttentionModel.compactCountOf)).toEqual(['840', '41.3k', '512k', '1M', '1.24M', '12.4M']);
    const noLimit = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    expect(fleetContentOf(noLimit).figures[1]).toEqual({ value: '10', label: 'agents' });
  });
});

describe('the forges that need a look', () => {
  test('a held forge offers Update forge as its one primary action, and Open in place', () => {
    const content = fleetContentOf(FLEET_FIVE_FORGES);
    expect(content.looksHead).toBe('Forges that need a look · 2');
    const held = lookOf(content, TRACKER_IDS.exampleMobileApp);
    expect([held.tone, held.condition, held.word, held.sentence, held.machineLine]).toEqual([
      'warn', 'held', 'Launches held', 'The install version changed. Nothing launches until this forge is updated.', '2 agents keep running through the update',
    ]);
    expect(actionsOf(held)).toEqual([
      ['Update forge', 'primary', { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp }, true],
      ['Open', 'plain', `#forge/${TRACKER_IDS.exampleMobileApp}`],
    ]);
  });

  test('a dormant forge with ready tickets offers Start forge', () => {
    const dormant = lookOf(fleetContentOf(FLEET_FIVE_FORGES), TRACKER_IDS.designSystem);
    expect([dormant.tone, dormant.condition, dormant.word, dormant.sentence, dormant.machineLine]).toEqual([
      'neutral', 'dormant', 'Dormant', 'This forge is not running. 3 tickets are ready and nothing drives them.', 'last command: ticket ready',
    ]);
    expect(actionsOf(dormant)).toEqual([['Start forge', 'primary', { kind: 'forge-start', trackerId: TRACKER_IDS.designSystem }, true]]);
  });

  test('the machine at its limit is never a forge\'s callout here', () => {
    const content = fleetContentOf(FLEET_AT_LIMIT);
    expect(content.looks.map((look) => look.lookKind)).toEqual(['launches-held', 'dormant-with-ready-tickets']);
  });

  test('new code offers a restart, which a forge whose control contract Gaia does not know cannot be sent', () => {
    const withNewCode: FleetDocumentForge = { ...FLEET_FIVE_FORGES_READINGS.researchWiki, notices: [{ kind: 'new-code', text: 'The forge code changed on disk.' }] };
    const fleet: FleetDocument = {
      ...FLEET_FIVE_FORGES,
      forges:     FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.researchWiki ? withNewCode : forge)),
      needsALook: [{ trackerId: TRACKER_IDS.researchWiki, kind: 'new-code' }],
    };
    const look = lookOf(fleetContentOf(fleet), TRACKER_IDS.researchWiki);
    expect([look.word, look.sentence, look.machineLine]).toEqual(['New code', 'The forge code changed on disk.', 'code 3f9a2c1']);
    expect(actionsOf(look)).toEqual([['Restart onto the new code', 'primary', { kind: 'forge-restart', trackerId: TRACKER_IDS.researchWiki }, true]]);
    const unknownControl = { ...withNewCode, contracts: { ...withNewCode.contracts, control: 2 } };
    const withUnknownControl = { ...fleet, forges: fleet.forges.map((forge) => (forge.trackerId === TRACKER_IDS.researchWiki ? unknownControl : forge)) };
    const refused = lookOf(fleetContentOf(withUnknownControl), TRACKER_IDS.researchWiki);
    expect(refused.actions.map((action) => action.kind === 'command' && action.forgeAcceptsIt)).toEqual([false]);
  });

  test('a failed baton pass shows the forge\'s own warning and opens the forge in place', () => {
    const failed: FleetDocumentForge = { ...FLEET_FIVE_FORGES_READINGS.invoiceService, warnings: [{ kind: 'baton-pass-failed', text: 'The successor Overseer did not start.' }] };
    const fleet: FleetDocument = {
      ...FLEET_FIVE_FORGES,
      forges:     FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService ? failed : forge)),
      needsALook: [{ trackerId: TRACKER_IDS.invoiceService, kind: 'baton-pass-failed' }],
    };
    const look = lookOf(fleetContentOf(fleet), TRACKER_IDS.invoiceService);
    expect([look.tone, look.word, look.sentence]).toEqual(['error', 'Baton pass failed', 'The successor Overseer did not start.']);
    expect(actionsOf(look)).toEqual([['Open', 'plain', `#forge/${TRACKER_IDS.invoiceService}`]]);
  });
});

describe('the running forges and what just happened', () => {
  test('one card per forge that runs agents, a waiting job slate, and what waits on User', () => {
    const { running, runningHead } = fleetContentOf(FLEET_FIVE_FORGES);
    expect(runningHead).toBe('Running · 4');
    expect(running.map((card) => [card.project, card.conditionWord, card.slotsText, card.waitingText, card.href])).toEqual([
      ['Example Storefront', 'live', '4 / 5', '2 wait on you', `#forge/${TRACKER_IDS.exampleStorefront}`],
      ['Invoice Service', 'live', '3 / 5', '2 wait on you', `#forge/${TRACKER_IDS.invoiceService}`],
      ['Research Wiki', 'live', '1 / 3', '1 waits on you', `#forge/${TRACKER_IDS.researchWiki}`],
      ['Example Mobile App', 'launches held', '2 / 2', null, `#forge/${TRACKER_IDS.exampleMobileApp}`],
    ]);
    expect(running[0]?.jobs).toEqual([
      { jobId: 'J2', role: 'builder', text: 'J2 builder' },
      { jobId: 'J3', role: 'waiting', text: 'J3 builder' },
      { jobId: 'J4', role: 'builder', text: 'J4 builder' },
      { jobId: 'J6', role: 'reviewer', text: 'J6 reviewer' },
    ]);
  });

  test('just happened is the newest four entries with their clock times, the forge\'s text unedited', () => {
    expect(fleetContentOf(FLEET_FIVE_FORGES).recent.map((entry) => [entry.clockText, entry.project, entry.text])).toEqual([
      ['13:16', 'Example Storefront', 'J4 builder started on #013 Product image zoom'],
      ['13:15', 'Example Storefront', 'J3 asked E2: How long should a password reset link stay valid?'],
      ['13:07', 'Invoice Service', '#031 Round VAT per line, not per invoice was reviewed and waits for your accept'],
      ['13:05', 'Example Storefront', '#010 Wishlist sharing landed on main'],
    ]);
  });
});

describe('forges Gaia cannot fully read (B3)', () => {
  test('the head and the waiting figure say more is possible, and every figure is the document\'s own', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    expect(content.waitingHead).toBe('Waiting on you · 4 known, more possible');
    expect(content.figures.map((figure) => figure.value)).toEqual(['4+', '10 / 12', '8', '5', '1.08M', '0']);
    expect(content.status.text).toBe('3 forges running, 1 holds its launches · 1 unreachable · 1 not readable by this Gaia');
  });

  test('an unreachable forge\'s rows are read as last reported and cannot act; the first row that can act is primary', () => {
    const { rows } = fleetContentOf(FLEET_DEGRADED);
    expect(rows.map((row) => [row.idText, row.isStale, row.isPrimary, row.metaText])).toEqual([
      ['E4', true, false, 'as last reported 13:14 · opened 12:58'],
      ['#015', false, true, 'filed by intake · filed 2h 04m'],
      ['#031', true, false, 'as last reported 13:14 · reviewed 13:07'],
      ['E2', false, false, 'asked by J3 builder · opened 4m'],
    ]);
  });

  test('the unreachable forge has a banner with its last stamp, and a callout with its address, process and last answer', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    expect(content.banners).toEqual([{ trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service', lastReportedClock: '13:14' }]);
    const unreachable = lookOf(content, TRACKER_IDS.invoiceService);
    expect([unreachable.tone, unreachable.condition, unreachable.word, unreachable.machineLine]).toEqual([
      'error', 'unreachable', 'Unreachable', '127.0.0.1:4957 · process 48211 · last answer 13:14',
    ]);
    expect(actionsOf(unreachable)).toEqual([
      ['Look again', 'plain', { kind: 'fleet-look-again' }, true],
      ['Stop', 'plain', `#forges?forge=${TRACKER_IDS.invoiceService}`],
    ]);
  });

  test('a counts-only forge is a dashed callout with its counts, and a newer one a warn callout with its contract numbers', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    const countsOnly = lookOf(content, TRACKER_IDS.researchWiki);
    expect([countsOnly.tone, countsOnly.word, countsOnly.sentence, countsOnly.machineLine]).toEqual([
      'neutral',
      'Counts only',
      'This forge is older than the monitor contract. Gaia reads its summary: 1 entry waits on you, 1 agent runs. Open it to see what waits.',
      'summary 1 · no monitor contract',
    ]);
    expect(actionsOf(countsOnly)).toEqual([
      ['Open in new tab', 'plain', { kind: 'forge-open-in-browser', trackerId: TRACKER_IDS.researchWiki }, true],
      ['Update forge', 'plain', { kind: 'forge-update', trackerId: TRACKER_IDS.researchWiki }, true],
    ]);
    const newer = lookOf(content, ANALYTICS_SANDBOX_TRACKER_ID);
    expect([newer.tone, newer.condition, newer.word, newer.sentence, newer.machineLine]).toEqual([
      'warn',
      'unreadable',
      'Newer than this Gaia',
      'This forge publishes monitor contract 2. This Gaia reads 1, so it shows nothing of it and sends it nothing. Update Gaia.',
      'monitor 2 · control 2',
    ]);
    expect(actionsOf(newer)).toEqual([['Open in new tab', 'plain', { kind: 'forge-open-in-browser', trackerId: ANALYTICS_SANDBOX_TRACKER_ID }, true]]);
  });

  test('the side panel names each forge\'s contract and what it gives, and marks exactly the forges figures.incompleteFor names', () => {
    const { readings } = fleetContentOf(FLEET_DEGRADED);
    expect(readings?.map((reading) => [reading.project, reading.contractText, reading.readingText, reading.totalsCannotVouchForIt])).toEqual([
      ['Example Storefront', 'monitor 1', 'Everything, live.', false],
      ['Invoice Service', 'monitor 1', 'Nothing since 13:14. Its rows are shown as last reported and their actions are off.', true],
      ['Research Wiki', 'summary 1', 'Counts and jobs only. No questions, reviews or notices by name.', true],
      ['Example Mobile App', 'monitor 1', 'Everything, live.', false],
      ['Analytics Sandbox', 'monitor 2', 'Nothing. Its contract is newer than this Gaia.', true],
    ]);
    const marked = readings?.filter((reading) => reading.totalsCannotVouchForIt).map((reading) => reading.trackerId);
    expect(marked).toEqual(FLEET_DEGRADED.figures.incompleteFor);
    expect(fleetContentOf(FLEET_FIVE_FORGES).readings).toBeNull();
  });

  test('when the forge answers again its rows are read normally, its banner leaves, and the first row is primary again', () => {
    const answeredAgain: FleetDocument = {
      ...FLEET_DEGRADED,
      forges:     FLEET_DEGRADED.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService ? FLEET_FIVE_FORGES_READINGS.invoiceService : forge)),
      needsALook: FLEET_DEGRADED.needsALook.filter((look) => look.trackerId !== TRACKER_IDS.invoiceService),
    };
    const content = fleetContentOf(answeredAgain);
    expect(content.banners).toEqual([]);
    expect(content.rows.map((row) => [row.idText, row.isStale, row.isPrimary, row.metaText])).toEqual([
      ['E4', false, true, 'from incident I2 · opened 21m'],
      ['#015', false, false, 'filed by intake · filed 2h 04m'],
      ['#031', false, false, 'merges clean into main · reviewed 12m'],
      ['E2', false, false, 'asked by J3 builder · opened 4m'],
    ]);
  });
});

describe('no forge yet (B4)', () => {
  test('a fleet with no forge is its own screen, and the forge program is missing when neither the settings nor Gaia know one', () => {
    expect(noForgeContentOf(FLEET_EMPTY)).toEqual({ status: { condition: null, text: 'no forge on this machine yet' }, forgeProgramIsMissing: true });
    const chosen = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, forgeProgramPath: '/Users/alexexample/.bun/bin/forge' } };
    expect(noForgeContentOf(chosen).forgeProgramIsMissing).toBe(false);
    const found = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: '/Users/alexexample/.bun/bin/forge' } };
    expect(noForgeContentOf(found).forgeProgramIsMissing).toBe(false);
  });
});

describe('a refusal\'s code and sentence', () => {
  test('are the forge\'s own when it refused, and Gaia\'s when nothing answered for it', () => {
    const refused = {
      answerVersion: 1, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    } as const;
    expect(AttentionModel.refusalTextOf({ kind: 'forge-update', result: { verdict: 'answered', answer: refused } }))
      .toEqual({ code: 'update-in-progress', sentence: 'An update already runs in this repository.' });
    const notSupported = {
      answerVersion: 1, outcome: 'not-supported', refusal: null, text: null
    } as const;
    expect(AttentionModel.refusalTextOf({ kind: 'forge-restart', result: { verdict: 'answered', answer: notSupported } }))
      .toEqual({ code: 'not-supported', sentence: 'This forge does not take this command from Gaia.' });
    expect(AttentionModel.refusalTextOf({ kind: 'forge-start', result: { verdict: 'server-unreachable' } }))
      .toEqual({ code: 'server-unreachable', sentence: 'Gaia\'s server could not be reached.' });
  });
});
