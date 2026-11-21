/**
 * What the Attention view shows of a fleet document. What matters (`docs/design/screens.md` A1, B3, B4): with `fleet-five-forges` the list holds the five
 * rows of A1 in the fleet's order, each with its forge, kind, id, subject, meta line, age and the forge's route in place, the first row's button the only
 * primary; an age is printed from the page's clock and no order depends on it; nothing waiting says so and keeps the figures, and today's figures stay
 * absent while no forge reports today; the forges that need a look carry the actions of `docs/design/screens.md` A1, "Forges that need a look", the
 * machine's limit never among them. B3: the head and the figure say "more possible" and the figures fold into one line, an unreachable forge's rows are
 * read as last reported and cannot act, its banner and callout name what Gaia last saw, every figure comes from the document and the forges it cannot
 * vouch for are named in the side panel, and a forge that answers again is read normally. The Versions boards (U1): an older forge is an orange callout
 * with Update forge and its steps, a newer one a neutral dashed callout that only explains, each with its versions line; the figures stay in the title
 * with the agents marked `+`, the side panel names each forge by its version, and the totals and the running cards name the forges they leave out. B4: no
 * forge gives its own screen, while every forge hidden does not; the forge program is missing only when neither the settings nor Gaia know one, and a
 * known one is named from ~.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                                    from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentForge, FleetDocumentLookKind } from '../../@types/FleetDocument.ts';
import type { ClockReading }                                             from '../../shared/@types/ClockReading.ts';
import { ForgeVersionsTextUtil }                                         from '../../shared/utils/ForgeVersionsTextUtil.ts';
import { FLEET_AT_LIMIT }                                                from '../../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                                from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                   from '../../testing/fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_OUTAGE_ENDINGS }                       from '../../testing/fixtures/fleet-outage-endings.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS } from '../../testing/fixtures/fleet-versions.ts';
import {
  type AttentionContent,
  AttentionModel,
  type ForgeReadingLine,
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

/** A reading's right side as plain text, its version numbers in line. */
function rightTextOf({ rightText }: ForgeReadingLine): string {
  return rightText.kind === 'contract' ? rightText.text : ForgeVersionsTextUtil.plainTextOf(rightText.text);
}

/** A callout's versions line, or its machine line, as plain text. */
function lineOf(look: LookCallout): string | null {
  return look.versionsLine === null ? look.machineLine : ForgeVersionsTextUtil.plainTextOf(look.versionsLine);
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
      ['Invoice Service', 'Escalated', 'warn', 'E4', 'The VAT gate cannot run in the sandbox. Allow network for it?', 'from incident I2 · opened 21m', 'Answer'],
      ['Example Storefront', 'Draft', 'warn', '#015', 'Search suggestions', 'filed by intake · 2h 04m', 'Ready'],
      ['Research Wiki', 'Question', 'warn', 'E1', 'Two gates are proposed for this repository. Accept them?', 'pipeline-proposal · opened 26m', 'Answer'],
      ['Invoice Service', 'Accept', 'pass', '#031', 'Round VAT per line, not per invoice', 'merges clean into main · reviewed 12m', 'Accept'],
      ['Example Storefront', 'Question', 'warn', 'E2', 'How long should a password reset link stay valid?', 'asked by J3 builder · opened 4m', 'Answer'],
    ]);
  });

  test('a meta line that already opens with the stamp\'s word prints the age alone after it, and any other prints the word before the age', () => {
    const metaTexts = fleetContentOf(FLEET_FIVE_FORGES).rows.map((row) => row.metaText);
    expect(metaTexts.filter((metaText) => metaText.startsWith('filed '))).toEqual(['filed by intake · 2h 04m']);
    expect(metaTexts.filter((metaText) => !metaText.startsWith('filed ')).every((metaText) => /· (opened|reviewed) \d/.test(metaText))).toBe(true);
  });

  test('each row shows its forge\'s dot and condition word, and only the first row\'s button is primary', () => {
    const { rows } = fleetContentOf(FLEET_FIVE_FORGES);
    expect(rows.map((row) => [row.condition, row.conditionWord, row.isStale])).toEqual(Array.from({ length: 5 }, () => ['live', 'live', false]));
    expect(rows.map((row) => row.isPrimary)).toEqual([true, false, false, false, false]);
  });

  test('the Answer button of E2 goes to Example Storefront in place at #questions/E2', () => {
    const answerOnE2 = fleetContentOf(FLEET_FIVE_FORGES).rows.find((row) => row.idText === 'E2');
    expect(answerOnE2?.href).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/questions/E2`);
  });

  test('an age is printed from the page\'s clock, and the order is the document\'s whatever the clock reads', () => {
    const anHourLater: ClockReading = { ...ARTBOARD_CLOCK, nowEpochMilliseconds: ARTBOARD_CLOCK.nowEpochMilliseconds + 3_600_000 };
    const atTheArtboard = fleetContentOf(FLEET_FIVE_FORGES).rows;
    const later = fleetContentOf(FLEET_FIVE_FORGES, anHourLater).rows;
    expect(later.map((row) => row.key)).toEqual(atTheArtboard.map((row) => row.key));
    expect(later.map((row) => row.metaText.split(' · ').at(-1))).toEqual(['opened 1h 21m', '3h 04m', 'opened 1h 26m', 'reviewed 1h 12m', 'opened 1h 04m']);
    const reversed = { ...FLEET_FIVE_FORGES, attention: [...FLEET_FIVE_FORGES.attention].reverse() };
    expect(fleetContentOf(reversed).rows.map((row) => row.idText)).toEqual(['E2', '#031', 'E1', '#015', 'E4']);
  });

  test('with nothing waiting the list\'s place says so, and the figures stay', () => {
    const nothingWaits: FleetDocument = { ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } };
    const content = fleetContentOf(nothingWaits);
    expect([content.rows, content.nothingText, content.waitingHead]).toEqual([[], 'Nothing waits on you.', 'Waiting on you · 0']);
    expect(content.figures.map((figure) => figure.label)).toEqual(['waiting on you', 'agents', 'tickets ready', 'done today', 'tokens today', 'open incidents']);
  });
});

describe('the figures', () => {
  test('print each figure of the document, only what waits on User marked as waiting', () => {
    const content = fleetContentOf(FLEET_FIVE_FORGES);
    expect(content.figures.map((figure) => [figure.value, figure.attention])).toEqual([
      ['5', true],
      ['10 / 12', false],
      ['11', false],
      ['6', false],
      ['1.24M', false],
      ['0', false],
    ]);
  });

  test('the page title shows the figures while every forge is read in full, and none while one is not (B3)', () => {
    expect(AttentionModel.titleFiguresOf(FLEET_FIVE_FORGES)).toEqual([...fleetContentOf(FLEET_FIVE_FORGES).figures]);
    expect(AttentionModel.titleFiguresOf(FLEET_DEGRADED)).toEqual([]);
  });

  test('print an unknown machine limit as the agents alone', () => {
    const noLimit = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    expect(fleetContentOf(noLimit).figures[1]).toEqual({ value: '10', label: 'agents', attention: false });
  });

  test('with no forge reporting today, neither "done today" nor "tokens today" is printed as a zero', () => {
    const forges = FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, today: null }));
    const noToday: FleetDocument = { ...FLEET_FIVE_FORGES, forges, figures: { ...FLEET_FIVE_FORGES.figures, deliveredToday: 0, tokensToday: 0 } };
    expect(fleetContentOf(noToday).figures.map((figure) => figure.label)).toEqual(['waiting on you', 'agents', 'tickets ready', 'open incidents']);
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
      ['Open', 'quiet', `#forge/${TRACKER_IDS.exampleMobileApp}`],
    ]);
  });

  test('a callout with Update forge holds the Restart it offers once the update left a restart pending, and one without holds none', () => {
    const content = fleetContentOf(FLEET_FIVE_FORGES);
    expect(lookOf(content, TRACKER_IDS.exampleMobileApp).restartAfterUpdate).toEqual({
      kind:           'command',
      label:          'Restart',
      emphasis:       'primary',
      command:        { kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp },
      forgeAcceptsIt: true,
    });
    expect(lookOf(content, TRACKER_IDS.designSystem).restartAfterUpdate).toBeNull();
  });

  test('a dormant forge with ready tickets offers Start forge', () => {
    const dormant = lookOf(fleetContentOf(FLEET_FIVE_FORGES), TRACKER_IDS.designSystem);
    expect([dormant.tone, dormant.condition, dormant.word, dormant.sentence, dormant.machineLine]).toEqual([
      'neutral', 'dormant', 'Dormant', 'This forge is not running. 3 tickets are ready and nothing drives them.', 'last command: Stop forge',
    ]);
    expect(actionsOf(dormant)).toEqual([['Start forge', 'quiet', { kind: 'forge-start', trackerId: TRACKER_IDS.designSystem }, true]]);
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
    const unknownControl = { ...withNewCode, contracts: { ...withNewCode.contracts, control: 4 } };
    const withUnknownControl = { ...fleet, forges: fleet.forges.map((forge) => (forge.trackerId === TRACKER_IDS.researchWiki ? unknownControl : forge)) };
    const refused = lookOf(fleetContentOf(withUnknownControl), TRACKER_IDS.researchWiki);
    expect(refused.actions.map((action) => action.kind === 'command' && action.forgeAcceptsIt)).toEqual([false]);
  });

  test('a failed restart shows the forge\'s own warning and opens the forge in place', () => {
    const warning = { kind: 'restart-failed', text: 'The restart to code example-code failed at preflight.' };
    const failed: FleetDocumentForge = { ...FLEET_FIVE_FORGES_READINGS.invoiceService, warnings: [warning] };
    const fleet: FleetDocument = {
      ...FLEET_FIVE_FORGES,
      forges:     FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService ? failed : forge)),
      needsALook: [{ trackerId: TRACKER_IDS.invoiceService, kind: 'restart-failed' }],
    };
    const look = lookOf(fleetContentOf(fleet), TRACKER_IDS.invoiceService);
    expect([look.tone, look.word, look.sentence]).toEqual(['error', 'Restart failed', warning.text]);
    expect(actionsOf(look)).toEqual([['Open', 'quiet', `#forge/${TRACKER_IDS.invoiceService}`]]);
  });
});

describe('the running forges and what just happened', () => {
  test('one card per forge that runs agents, a job that waits on a decision drawn as asking User, and what waits on User', () => {
    const { running, runningHead } = fleetContentOf(FLEET_FIVE_FORGES);
    expect(runningHead).toBe('Running · 4');
    expect(running.map((card) => [card.project, card.conditionWord, card.slotsText, card.waitingText, card.href])).toEqual([
      ['Example Storefront', 'live', '4 / 5', '2 wait on you', `#forge/${TRACKER_IDS.exampleStorefront}`],
      ['Invoice Service', 'live', '3 / 5', '2 wait on you', `#forge/${TRACKER_IDS.invoiceService}`],
      ['Research Wiki', 'live', '1 / 3', '1 waits on you', `#forge/${TRACKER_IDS.researchWiki}`],
      ['Example Mobile App', 'launches held', '2 / 2', null, `#forge/${TRACKER_IDS.exampleMobileApp}`],
    ]);
    expect(running[0]?.jobs).toEqual([
      { jobId: 'J2', role: 'builder', roleWord: 'builder' },
      { jobId: 'J3', role: 'needs-user', roleWord: 'asks' },
      { jobId: 'J4', role: 'builder', roleWord: 'builder' },
      { jobId: 'J6', role: 'reviewer', roleWord: 'reviewer' },
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
  });

  test('the figures fold into one line while a forge is not fully read, and stand in their row once every forge is', () => {
    expect(fleetContentOf(FLEET_DEGRADED).figuresForm).toBe('line');
    expect(fleetContentOf({ ...FLEET_DEGRADED, figures: { ...FLEET_DEGRADED.figures, incompleteFor: [] } }).figuresForm).toBe('row');
    expect(fleetContentOf(FLEET_FIVE_FORGES).figuresForm).toBe('row');
  });

  test('an unreachable forge\'s rows are read as last reported and cannot act; the first row that can act is primary', () => {
    const { rows } = fleetContentOf(FLEET_DEGRADED);
    expect(rows.map((row) => [row.idText, row.isStale, row.isPrimary, row.metaText])).toEqual([
      ['E4', true, false, 'as last reported 13:14 · opened 12:58'],
      ['#015', false, true, 'filed by intake · 2h 04m'],
      ['#031', true, false, 'as last reported 13:14 · reviewed 13:07'],
      ['E2', false, false, 'asked by J3 builder · opened 4m'],
    ]);
  });

  test('the waiting head\'s pill holds the count alone, and the running cards are compact beside the side panel, each saying how it is read', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    expect([content.waitingCount, fleetContentOf(FLEET_FIVE_FORGES).waitingCount]).toEqual(['4 known, more possible', '5']);
    expect([content.runningForm, fleetContentOf(FLEET_FIVE_FORGES).runningForm]).toEqual(['compact', 'full']);
    expect(content.running.map((card) => [card.project, card.conditionWord, card.slotsText, card.isStale])).toEqual([
      ['Example Storefront', 'live', '4 / 5', false],
      ['Invoice Service', 'as last reported 13:14', '3 / 5', true],
      ['Research Wiki', 'counts only', '1 agent', false],
      ['Example Mobile App', 'launches held', '2 / 2', false],
    ]);
    expect(content.readings?.map((reading) => reading.condition)).toEqual(['live', 'unreachable', 'live', 'held', 'unreadable']);
  });

  test('the four callouts follow B3\'s order by kind, whatever order the document lists the forges in', () => {
    const boardOrder: FleetDocumentLookKind[] = ['unreachable', 'launches-held', 'newer-contract', 'counts-only'];
    expect(fleetContentOf(FLEET_DEGRADED).looks.map((look) => look.lookKind)).toEqual(boardOrder);
    const reversed: FleetDocument = { ...FLEET_DEGRADED, needsALook: [...FLEET_DEGRADED.needsALook].reverse() };
    expect(fleetContentOf(reversed).looks.map((look) => look.lookKind)).toEqual(boardOrder);
  });

  test('the unreachable forge has a banner with its last stamp, and a callout with its address, process and last answer', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    expect(content.banners).toEqual([{ trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service', lastReportedClock: '13:14' }]);
    const unreachable = lookOf(content, TRACKER_IDS.invoiceService);
    expect([unreachable.tone, unreachable.condition, unreachable.word, unreachable.machineLine]).toEqual([
      'error', 'unreachable', 'Unreachable', '127.0.0.1:4957 · process 48211 · last answer 13:14',
    ]);
    expect(actionsOf(unreachable)).toEqual([['Look again', 'quiet', { kind: 'fleet-look-again' }, true]]);
  });

  test('a counts-only forge is a dashed callout with its counts, and a newer one a neutral callout with its contract numbers', () => {
    const content = fleetContentOf(FLEET_DEGRADED);
    const countsOnly = lookOf(content, TRACKER_IDS.researchWiki);
    expect([countsOnly.tone, countsOnly.word, countsOnly.sentence, countsOnly.machineLine]).toEqual([
      'neutral',
      'Counts only',
      'This forge is older than the monitor contract. Gaia reads its summary: 1 entry waits on you, 1 agent runs. Open it to see what waits.',
      'summary 3 · no monitor contract',
    ]);
    expect(actionsOf(countsOnly)).toEqual([
      ['Update forge', 'quiet', { kind: 'forge-update', trackerId: TRACKER_IDS.researchWiki }, true],
    ]);
    expect(countsOnly.restartAfterUpdate).toMatchObject({ label: 'Restart', forgeAcceptsIt: false });
    const newer = lookOf(content, ANALYTICS_SANDBOX_TRACKER_ID);
    expect([newer.tone, newer.wordForm, newer.condition, newer.word, newer.sentence, newer.machineLine]).toEqual([
      'neutral',
      'sentence',
      'unreadable',
      'Newer than this Gaia',
      'This forge publishes monitor contract 7. This Gaia reads 6, so it shows nothing of it and sends it nothing.',
      'monitor 7 · control 4',
    ]);
    expect(actionsOf(newer)).toEqual([]);
  });

  test('a forge too old for this Gaia to talk to is a warn callout with both versions, Update forge as its primary', () => {
    const olderSandbox = {
      ...FLEET_DEGRADED.forges.find((forge) => forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID),
      fidelity: 'older-contract',
      versions: { verdict: 'older', current: { major: 1, minor: 0 }, minimumSupported: { major: 0, minor: 0 } },
    } as FleetDocument['forges'][number];
    const olderDocument: FleetDocument = {
      ...FLEET_DEGRADED,
      forges:     FLEET_DEGRADED.forges.map((forge) => (forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID ? olderSandbox : forge)),
      needsALook: FLEET_DEGRADED.needsALook.map((look) => (look.trackerId === ANALYTICS_SANDBOX_TRACKER_ID ? { ...look, kind: 'older-contract' as const } : look)),
    };
    const older = lookOf(fleetContentOf(olderDocument), ANALYTICS_SANDBOX_TRACKER_ID);
    expect([older.tone, older.condition, older.word, lineOf(older)]).toEqual(['warn', 'outdated', 'Older than this Gaia', 'forge 1.0 · this Gaia is built for forge 1.1']);
    expect(older.sentence).toBe('This forge is older than the forge this Gaia is built for. Gaia shows nothing of its work and sends it no command until '
      + 'the forge is updated. Its agents keep running.');
    expect(actionsOf(older)).toEqual([
      ['Update forge', 'primary', { kind: 'forge-update', trackerId: ANALYTICS_SANDBOX_TRACKER_ID }, true],
    ]);
    expect(fleetContentOf(olderDocument).readings?.find((reading) => reading.trackerId === ANALYTICS_SANDBOX_TRACKER_ID)?.readingText)
      .toBe('That it runs. Nothing of its work until the forge is updated.');
  });

  test('a forge that serves no versions, as every released forge, is the same callout, saying it states no version', () => {
    const unversionedSandbox = {
      ...FLEET_DEGRADED.forges.find((forge) => forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID),
      fidelity: 'older-contract',
      versions: { verdict: 'older', current: null, minimumSupported: null },
    } as FleetDocument['forges'][number];
    const unversionedDocument: FleetDocument = {
      ...FLEET_DEGRADED,
      forges:     FLEET_DEGRADED.forges.map((forge) => (forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID ? unversionedSandbox : forge)),
      needsALook: FLEET_DEGRADED.needsALook.map((look) => (look.trackerId === ANALYTICS_SANDBOX_TRACKER_ID ? { ...look, kind: 'older-contract' as const } : look)),
    };
    const older = lookOf(fleetContentOf(unversionedDocument), ANALYTICS_SANDBOX_TRACKER_ID);
    expect([older.tone, older.word, lineOf(older), actionsOf(older)[0]?.[0]])
      .toEqual(['warn', 'Older than this Gaia', 'forge states no version · this Gaia is built for forge 1.1', 'Update forge']);
  });

  test('an older forge read without its versions is named in the side panel as its callout names it, a forge that states no version', () => {
    const olderSandbox = {
      ...FLEET_DEGRADED.forges.find((forge) => forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID),
      fidelity: 'older-contract',
      versions: null,
    } as FleetDocument['forges'][number];
    const olderDocument: FleetDocument = {
      ...FLEET_DEGRADED,
      forges: FLEET_DEGRADED.forges.map((forge) => (forge.trackerId === ANALYTICS_SANDBOX_TRACKER_ID ? olderSandbox : forge)),
    };
    const reading = fleetContentOf(olderDocument).readings?.find((line) => line.trackerId === ANALYTICS_SANDBOX_TRACKER_ID);
    expect(reading === undefined ? null : [rightTextOf(reading), reading.readingText]).toEqual([
      'states no version · older',
      'That it runs. Nothing of its work until the forge is updated.',
    ]);
  });

  test('the side panel names a forge read in full by its version, any other by its contract, and marks the forges figures.incompleteFor names', () => {
    const { readings } = fleetContentOf(FLEET_DEGRADED);
    expect(readings?.map((reading) => [reading.project, rightTextOf(reading), reading.readingText, reading.totalsCannotVouchForIt])).toEqual([
      ['Example Storefront', 'forge 1.1', 'Everything, live.', false],
      ['Invoice Service', 'monitor 6', 'Nothing since 13:14. Its rows show as last reported.', true],
      ['Research Wiki', 'summary 3', 'Counts and jobs only. No questions or reviews by name.', true],
      ['Example Mobile App', 'forge 1.1', 'Everything, live.', false],
      ['Analytics Sandbox', 'monitor 7', 'Nothing. Its contract is newer than this Gaia.', true],
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
      ['#015', false, false, 'filed by intake · 2h 04m'],
      ['#031', false, false, 'merges clean into main · reviewed 12m'],
      ['E2', false, false, 'asked by J3 builder · opened 4m'],
    ]);
  });

  test('a forge newer than this Gaia is a callout that only explains, in its own terms, and offers no update of Gaia', () => {
    const newer = lookOf(fleetContentOf(FLEET_VERSIONS), FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox);
    expect([newer.tone, newer.word, newer.sentence, lineOf(newer)]).toEqual([
      'neutral',
      'Newer than this Gaia',
      'This forge no longer serves clients built for forge 3.1, as this Gaia is. Gaia sees that it runs, shows nothing of its work and sends it '
        + 'no command. A newer Gaia shows it.',
      'forge 4.1 · serves clients built for forge 4.0 and later · this Gaia is built for forge 3.1',
    ]);
    expect(actionsOf(newer)).toEqual([]);
    expect([newer.updateSteps, newer.restartAfterUpdate]).toEqual([null, null]);
  });
});

describe('forges at a version this Gaia cannot talk to (U1)', () => {
  const content = fleetContentOf(FLEET_VERSIONS);

  test('the callouts come older first, then newer, and an ahead or current forge has none', () => {
    expect(content.looksHead).toBe('Forges that need a look · 2');
    expect(content.looks.map((look) => [look.project, look.tone, look.condition, look.word, look.wordForm])).toEqual([
      ['Example Billing', 'warn', 'outdated', 'Older than this Gaia', 'sentence'],
      ['Analytics Sandbox', 'neutral', 'unreadable', 'Newer than this Gaia', 'sentence'],
    ]);
  });

  test('the older forge\'s callout offers Update forge as its primary, then a secondary Restart once the update is done, with each step\'s words', () => {
    const older = lookOf(content, FLEET_VERSIONS_TRACKER_IDS.exampleBilling);
    expect(lineOf(older)).toBe('forge 1.8 · this Gaia is built for forge 3.1');
    expect(actionsOf(older).map(([label, emphasis]) => [label, emphasis])).toEqual([['Update forge', 'primary']]);
    expect(older.restartAfterUpdate).toMatchObject({ label: 'Restart', emphasis: 'quiet' });
    expect(older.updateSteps).toEqual({
      pendingText:        'Updating the forge… its agents keep running',
      pendingButtonLabel: 'Updating',
      doneSentence:       'This forge stays older than the forge this Gaia is built for until its Hephaestus restarts.',
      doneStepSentence:   'Its Hephaestus runs the old code, and this Gaia reads none of it, until it restarts.',
    });
  });

  test('the figures stay in the title, the agents marked as leaving out forges whose agents Gaia cannot read', () => {
    expect(content.figuresForm).toBe('row');
    expect(AttentionModel.titleFiguresOf(FLEET_VERSIONS).map((figure) => figure.value)).toEqual(['5+', '8+ / 12', '9', '5', '1.02M', '0']);
    expect(content.waitingCount).toBe('5 known, more possible');
  });

  test('the side panel names each forge by its version, in orange only for the forge that waits on Update forge', () => {
    expect(content.readings?.map((reading) => [reading.project, rightTextOf(reading), reading.rightText.kind === 'versions' && reading.rightText.isWork, reading.readingText]))
      .toEqual([
        ['Example Storefront', 'forge 3.4 · ahead', false, 'All this Gaia knows. What 3.4 added shows in its Bridge.'],
        ['Invoice Service', 'forge 3.1', false, 'Everything, live.'],
        ['Research Wiki', 'forge 3.1', false, 'Everything, live.'],
        ['Example Billing', 'forge 1.8 · older', true, 'That it runs. Nothing of its work until the forge is updated.'],
        ['Analytics Sandbox', 'forge 4.1 · newer', false, 'That it runs. Nothing of its work.'],
      ]);
  });

  test('the totals and the running cards name the forges they leave out, and the note links to their versions', () => {
    expect(content.readingsNote).toEqual({
      sentence:     'Gaia never guesses a count. The totals leave out Example Billing and Analytics Sandbox.',
      versionsHref: '#forges',
    });
    expect(content.running.map((card) => card.project)).toEqual(['Example Storefront', 'Invoice Service', 'Research Wiki']);
    expect(content.runningNote).toBe('Example Billing and Analytics Sandbox run too. This Gaia cannot read their agents.');
    expect(fleetContentOf(FLEET_DEGRADED).readingsNote).toEqual({
      sentence:     'Gaia never guesses a count. The totals leave out the three forges it cannot read in full.',
      versionsHref: null,
    });
    expect(fleetContentOf(FLEET_DEGRADED).runningNote).toBeNull();
  });
});

describe('no forge yet (B4)', () => {
  test('a fleet with no forge is its own screen, and the forge program is missing when neither the settings nor Gaia know one', () => {
    expect(noForgeContentOf(FLEET_EMPTY)).toEqual({ forgeProgramIsMissing: true, forgeProgramText: null });
    const chosen = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, forgeProgramPath: '/Users/alexexample/.bun/bin/forge' } };
    expect(noForgeContentOf(chosen).forgeProgramIsMissing).toBe(false);
    const found = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: '/Users/alexexample/.bun/bin/forge' } };
    expect(noForgeContentOf(found).forgeProgramIsMissing).toBe(false);
  });

  test('a fleet whose every forge is hidden is the fleet screen with nothing in it, not B4', () => {
    const everyForgeHidden: FleetDocument = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, hiddenTrackerIds: [TRACKER_IDS.exampleStorefront] } };
    expect(AttentionModel.screenOf(everyForgeHidden, ARTBOARD_CLOCK).kind).toBe('fleet');
    expect(fleetContentOf(everyForgeHidden).rows).toEqual([]);
  });

  test('names the forge program from ~, the one Gaia runs before the one the settings name, and one outside the home folder whole', () => {
    expect(FLEET_EMPTY.gaia.homeFolder).toBe('/Users/alexexample');
    const found = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, forgeProgramInUse: '/Users/alexexample/.bun/bin/forge' } };
    expect(noForgeContentOf(found).forgeProgramText).toBe('~/.bun/bin/forge');
    const chosen = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, forgeProgramPath: '/opt/forge/bin/forge' } };
    expect(noForgeContentOf(chosen).forgeProgramText).toBe('/opt/forge/bin/forge');
    expect(noForgeContentOf({ ...found, settings: chosen.settings }).forgeProgramText).toBe('~/.bun/bin/forge');
  });
});

describe('a forge alert', () => {
  const STOREFRONT = FLEET_FIVE_FORGES.forges[0];

  function alertRowOf(kind: 'forge-crashed' | 'forge-down' | 'forge-hung', actionLabel: 'Start' | 'Open', forgeChanges: Partial<FleetDocument['forges'][number]>) {
    if (STOREFRONT === undefined) throw new Error('the five-forges document holds no forge');
    const forge = { ...STOREFRONT, ...forgeChanges };
    const alert: FleetDocument['attention'][number] = {
      trackerId:               forge.trackerId,
      key:                     `forge-alert:${kind}`,
      kind,
      idText:                  '',
      ticketIds:               [],
      subject:                 '',
      jobId:                   null,
      askedBy:                 null,
      decisionKind:            null,
      escalatedFromIncidentId: null,
      metaText:                null,
      stamp:                   FLEET_FIXTURES_READ_AT,
      stampWord:               'crashed',
      actionLabel,
      boardRoute:              null,
    };
    const content = fleetContentOf({ ...FLEET_FIVE_FORGES, forges: [forge], attention: [alert] });
    return content.rows[0];
  }

  test('of a crashed forge names a suspected crash before a reboot and its error, and its Start sends the forge\'s start even unanswered', () => {
    const row = alertRowOf('forge-crashed', 'Start', {
      fidelity:     'unreachable',
      condition:    'unreachable',
      presence:     { state: 'crashed', generation: 1, at: FLEET_FIXTURES_READ_AT },
      crashSummary: {
        component: 'hephaestus', suspected: true, errorName: 'Error', errorMessage: null,
      },
    });
    expect([row?.kindText, row?.subject, row?.conditionWord, row?.isStale]).toEqual(['Crashed', 'Suspected crash before a reboot. Error', 'crashed', false]);
    expect(row?.command).toEqual({ kind: 'forge-start', trackerId: STOREFRONT?.trackerId ?? '' });
  });

  test('of a hung forge opens its route, where its waiting work is', () => {
    const row = alertRowOf('forge-hung', 'Open', { presence: { state: 'hung', generation: 1, at: null } });
    expect([row?.kindText, row?.actionLabel, row?.command, row?.href]).toEqual(['Not supervised', 'Open', null, `#forge/${STOREFRONT?.trackerId ?? ''}`]);
  });
});

describe('the agents a network outage stopped', () => {
  function forgesWithEndings(endings: readonly number[]): FleetDocument {
    const forges = FLEET_OUTAGE_ENDINGS.forges.map((forge, i) => ({ ...forge, outageEndings: endings[i] ?? 0 }));
    return { ...FLEET_OUTAGE_ENDINGS, forges, outageEndingsTotal: endings.reduce((total, count) => total + count, 0) };
  }

  test('head what waits on User in one row with the fleet\'s total, naming each forge with its own count, primary, opening the Agents view', () => {
    const [outageRow, ...forgeRows] = fleetContentOf(FLEET_OUTAGE_ENDINGS).rows;
    expect(outageRow).toMatchObject({
      trackerId:     null,
      project:       'Example Storefront and Invoice Service',
      conditionWord: 'network outage',
      kindText:      'Outage',
      subject:       '3 agents stopped on a network outage',
      metaText:      'Example Storefront 2 · Invoice Service 1',
      actionLabel:   'Open',
      href:          '#agents',
      command:       null,
      isStale:       false,
      isPrimary:     true,
    });
    expect(forgeRows.map((row) => row.isPrimary)).toEqual([false, false, false, false, false]);
    expect(forgeRows.map((row) => row.idText)).toEqual(fleetContentOf(FLEET_FIVE_FORGES).rows.map((row) => row.idText));
  });

  test('read one agent in the singular, and name a lone forge alone', () => {
    const [outageRow] = fleetContentOf(forgesWithEndings([0, 1])).rows;
    expect([outageRow?.subject, outageRow?.project, outageRow?.metaText]).toEqual(['1 agent stopped on a network outage', 'Invoice Service', 'Invoice Service 1']);
  });

  test('count once in the waiting head, as the document counts its alert', () => {
    expect(fleetContentOf(FLEET_OUTAGE_ENDINGS).waitingCount).toBe(String(FLEET_FIVE_FORGES.figures.waitingOnUser + 1));
  });
});

describe('the outage resume\'s answer', () => {
  const STOREFRONT_ID = TRACKER_IDS.exampleStorefront;
  const INVOICE_ID = TRACKER_IDS.invoiceService;
  const WIKI_ID = TRACKER_IDS.researchWiki;

  function answerOf(forges: CommandAnswerDocument['forges']): CommandAnswerDocument {
    return {
      answerVersion: 3, outcome: 'done', refusal: null, text: null, forges
    };
  }

  test('is nothing before the first resume', () => {
    expect(AttentionModel.outageResumeAnswerOf(null, FLEET_FIVE_FORGES)).toBeNull();
  });

  test('gives one line per forge that resumed, refused or did not answer, a refusal in the forge\'s own words, and none for a forge with nothing', () => {
    const answer = answerOf([
      {
        trackerId: STOREFRONT_ID, outcome: 'resumed', resumedCount: 2, refusalText: null
      },
      {
        trackerId: INVOICE_ID, outcome: 'refused', resumedCount: 0, refusalText: 'The install version changed: run `forge update`.'
      },
      {
        trackerId: WIKI_ID, outcome: 'nothing-to-do', resumedCount: 0, refusalText: null
      },
      {
        trackerId: 'hidden-forge-1a2b', outcome: 'not-reached', resumedCount: 0, refusalText: null
      },
    ]);
    expect(AttentionModel.outageResumeAnswerOf(answer, FLEET_FIVE_FORGES)).toEqual({
      lines: [
        {
          trackerId: STOREFRONT_ID, project: 'Example Storefront', outcome: 'resumed', text: 'Resumed 2 agents'
        },
        {
          trackerId: INVOICE_ID, project: 'Invoice Service', outcome: 'refused', text: 'The install version changed: run `forge update`.'
        },
        {
          trackerId: 'hidden-forge-1a2b', project: 'hidden-forge-1a2b', outcome: 'not-reached', text: 'Did not answer. Nothing was resumed there.'
        },
      ],
      nothingText: null,
    });
  });

  test('says there is nothing to resume when every forge answered nothing to do, and with no forge at all', () => {
    const nothing = answerOf([{
      trackerId: STOREFRONT_ID, outcome: 'nothing-to-do', resumedCount: 0, refusalText: null
    }]);
    expect(AttentionModel.outageResumeAnswerOf(nothing, FLEET_FIVE_FORGES)).toEqual({ lines: [], nothingText: 'Nothing to resume' });
    expect(AttentionModel.outageResumeAnswerOf(answerOf([]), FLEET_FIVE_FORGES)).toEqual({ lines: [], nothingText: 'Nothing to resume' });
  });
});
