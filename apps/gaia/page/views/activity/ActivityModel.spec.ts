/**
 * The Activity view's model (SCREENS A3). What matters: the rows from several forges keep the server's interleaving by `at`, newest first,
 * and the page compares no stamp to reorder them (acceptance 1); a forge that reports no `today` is absent from both side lists, not shown as
 * 0 (acceptance 2); each filter keeps exactly its rows; past three forges the rest sit in the menu; a row links into its forge only when the
 * forge gave it a route; the text is the forge's, unedited; every value no forge reports stays absent; and, for version 2's look (SCREENS
 * A3), the kind counts follow the chosen forge and the page title's figures total what the side lists show. Flint's brain (R4.6): its
 * entries carry the kind word "Flint's brain" and the diamond, the Agents filter keeps them and Landed drops them; the tokens-today total
 * stays the forges' own, and its note names the brain's part per forge, a running brain's tokens and today's ended runs', absent with no
 * brain today; the brain runs today count each run ended today and each brain running now, absent when no forge reports a brain, and read
 * as at least when a forge's entries were cut within the day. An entry of an earlier day carries its month and day. Clock times are read
 * in UTC, the fixtures' own zone, so the specs do not depend on the machine's.
 */
import { describe, expect, test } from 'bun:test';

import { LIMITS }                                                     from '../../../src/shared/constants/Limits.ts';
import type { FleetDocument, FleetDocumentBrain, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import type { ClockReading }                                          from '../../shared/@types/ClockReading.ts';
import { FLEET_EMPTY }                                                from '../../testing/fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_BRAINS,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { type ActivityFilters, ActivityModel, EVERY_ENTRY } from './ActivityModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const READINGS = FLEET_FIVE_FORGES_READINGS;
const ARTBOARD_CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

/** The next day's clock, at which the 12:46 run on Invoice Service is no longer today's. */
const NEXT_DAY_CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse('2026-11-13T09:00:00.000Z'), timeZone: 'UTC' };

function contentOf(fleetDocument: FleetDocument, filters: ActivityFilters = EVERY_ENTRY, clock: ClockReading = ARTBOARD_CLOCK) {
  return ActivityModel.activityContentOf(fleetDocument, filters, clock);
}

function withStorefrontBrain(brain: FleetDocumentBrain | 'not-reported'): FleetDocument {
  return { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? { ...forge, brain } : forge)) };
}

function withForges(forges: readonly FleetDocumentForge[]): FleetDocument {
  return { ...FLEET_FIVE_FORGES, forges: [...forges] };
}

describe('the entries', () => {
  test('rows from several forges interleave by at, newest first, as the artboard lists them', () => {
    const rows = contentOf(FLEET_FIVE_FORGES).rows.map((row) => [row.clockTime, row.project, row.categoryWord, row.text]);
    expect(rows).toEqual([
      ['13:18', 'Example Storefront', 'Flint\'s brain', 'Flint\'s brain started through the API · haiku low · 2:00 at most'],
      ['13:16', 'Example Storefront', 'Agent', 'J4 builder started on #013 Product image zoom'],
      ['13:15', 'Example Storefront', 'Needs you', 'J3 asked E2: How long should a password reset link stay valid?'],
      ['13:07', 'Invoice Service', 'Needs you', '#031 Round VAT per line, not per invoice was reviewed and waits for your accept'],
      ['13:05', 'Example Storefront', 'Landed', '#010 Wishlist sharing landed on main'],
      ['13:02', 'Invoice Service', 'Agent', 'J14 reviewer started on #032 VAT rounding rules'],
      ['12:58', 'Invoice Service', 'Needs you', 'E4 escalated from incident I2: the VAT gate cannot run in the sandbox'],
      ['12:53', 'Research Wiki', 'Needs you', 'E1 opened: two gates are proposed for this repository'],
      ['12:47', 'Research Wiki', 'Landed', '#006 Glossary page landed on main'],
      ['12:46', 'Invoice Service', 'Flint\'s brain', 'Flint\'s brain ran 2:00 · 4.2k tokens · started through the API'],
      ['12:40', 'Example Mobile App', 'Forge', 'Launches held: the install version changed'],
      ['12:38', 'Example Mobile App', 'Agent', 'J7 reviewer started on #020 Push permission prompt'],
      ['12:31', 'Invoice Service', 'Landed', '#030 Reminder emails landed on main'],
      ['12:20', 'Design System', 'Forge', 'Overseer stopped'],
      ['12:02', 'Example Storefront', 'Landed', '#009 Guest checkout landed on main'],
      ['11:48', 'Invoice Service', 'Landed', '#029 Payment terms on quotes landed on main'],
      ['11:15', 'Example Storefront', 'Needs you', '#015 Search suggestions was filed as a draft'],
      ['10:57', 'Example Storefront', 'Landed', '#008 Order history filters landed on main'],
    ]);
    const stamps = contentOf(FLEET_FIVE_FORGES).rows.map((row) => row.at);
    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  test('the order is the document\'s own: the page compares no stamp to reorder the entries', () => {
    const reversed = { ...FLEET_FIVE_FORGES, activity: FLEET_FIVE_FORGES.activity.toReversed() };
    expect(contentOf(reversed).rows.map((row) => row.key)).toEqual(contentOf(FLEET_FIVE_FORGES).rows.map((row) => row.key).toReversed());
  });

  test('a row with a route goes to its forge in place at that route, and a row without one links nowhere', () => {
    const { rows } = contentOf(FLEET_FIVE_FORGES);
    expect(rows[1]?.href).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/agents/J4`);
    expect(rows[3]?.href).toBe(`#forge/${TRACKER_IDS.invoiceService}/tickets/ticket-row/031`);
    expect(rows.filter((row) => row.href === null).map((row) => row.text)).toEqual([
      'Flint\'s brain started through the API · haiku low · 2:00 at most',
      'Flint\'s brain ran 2:00 · 4.2k tokens · started through the API',
      'Launches held: the install version changed',
      'Overseer stopped',
    ]);
  });

  test('each category has its dot, the brain\'s entries the diamond, and an agent\'s entry takes the role of the job the forge still reports', () => {
    expect(contentOf(FLEET_FIVE_FORGES).rows.slice(0, 11).map((row) => row.dotRole)).toEqual([
      'brain', 'builder', 'needs-user', 'needs-user', 'landed', 'reviewer', 'needs-user', 'needs-user', 'landed', 'brain', 'forge',
    ]);
    const storefrontWithoutJ4 = { ...READINGS.exampleStorefront, agents: READINGS.exampleStorefront.agents.filter((agent) => agent.jobId !== 'J4') };
    const jobEnded = withForges(FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? storefrontWithoutJ4 : forge)));
    expect(contentOf(jobEnded).rows[1]?.dotRole).toBeNull();
  });

  test('a clock time is read in the zone given, and a stamp that does not parse is shown as the forge wrote it', () => {
    const [newest] = FLEET_FIVE_FORGES.activity;
    if (newest === undefined) throw new Error('The fixture holds no entry.');
    expect(contentOf(FLEET_FIVE_FORGES, EVERY_ENTRY, { ...ARTBOARD_CLOCK, timeZone: 'Europe/Amsterdam' }).rows[1]?.clockTime).toBe('14:16');
    const unparsable = { ...FLEET_FIVE_FORGES, activity: [{ ...newest, at: 'shortly after lunch' }] };
    expect(contentOf(unparsable).rows.map((row) => row.clockTime)).toEqual(['shortly after lunch']);
  });

  test('an entry of an earlier day than the clock\'s carries its month and day, so it does not read as today\'s', () => {
    expect(contentOf(FLEET_FIVE_FORGES, EVERY_ENTRY, NEXT_DAY_CLOCK).rows[0]?.clockTime).toBe('11-12 13:18');
  });
});

describe('the filters', () => {
  test('a kind keeps exactly the entries of its category', () => {
    const landed = contentOf(FLEET_FIVE_FORGES, { kind: 'landed', trackerId: null }).rows;
    expect(landed.map((row) => row.text)).toEqual([
      '#010 Wishlist sharing landed on main',
      '#006 Glossary page landed on main',
      '#030 Reminder emails landed on main',
      '#009 Guest checkout landed on main',
      '#029 Payment terms on quotes landed on main',
      '#008 Order history filters landed on main',
    ]);
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'needs-user', trackerId: null }).rows).toHaveLength(5);
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'agent', trackerId: null }).rows).toHaveLength(5);
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'forge', trackerId: null }).rows).toHaveLength(2);
  });

  test('a forge keeps exactly its entries, and both filters hold together', () => {
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'everything', trackerId: TRACKER_IDS.researchWiki }).rows.map((row) => row.text)).toEqual([
      'E1 opened: two gates are proposed for this repository',
      '#006 Glossary page landed on main',
    ]);
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'needs-user', trackerId: TRACKER_IDS.exampleStorefront }).rows.map((row) => row.clockTime)).toEqual(['13:15', '11:15']);
  });

  test('the first three forges with entries are segments, the rest sit in the menu, and a forge with no entry is not offered', () => {
    const { forgeChoices } = contentOf(FLEET_FIVE_FORGES);
    expect(forgeChoices.segments.map((choice) => choice.project)).toEqual(['Example Storefront', 'Invoice Service', 'Research Wiki']);
    expect(forgeChoices.inMenu.map((choice) => choice.project)).toEqual(['Example Mobile App', 'Design System']);
    expect(forgeChoices.chosen).toBeNull();
  });

  test('a chosen forge that leaves the document is no longer chosen, and every forge\'s entries show again', () => {
    const withoutWiki = {
      ...withForges(FLEET_FIVE_FORGES.forges.filter((forge) => forge.trackerId !== TRACKER_IDS.researchWiki)),
      activity: FLEET_FIVE_FORGES.activity.filter((entry) => entry.trackerId !== TRACKER_IDS.researchWiki),
    };
    const content = contentOf(withoutWiki, { kind: 'everything', trackerId: TRACKER_IDS.researchWiki });
    expect(content.forgeChoices.chosen).toBeNull();
    expect(content.rows).toHaveLength(16);
  });

  test('the table\'s place says why it is empty: no entry at all, or none that the filters keep', () => {
    expect(contentOf(FLEET_EMPTY).emptySentence).toBe('No forge has reported activity yet.');
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'forge', trackerId: TRACKER_IDS.exampleStorefront }).emptySentence).toBe('No entry matches these filters.');
    expect(contentOf(FLEET_FIVE_FORGES).emptySentence).toBeNull();
  });
});

describe('the counts on the kind filter', () => {
  test('Needs you and Landed count their entries under the chosen forge, whatever kind is chosen', () => {
    expect(contentOf(FLEET_FIVE_FORGES).kindCounts).toEqual({ 'needs-user': 5, 'landed': 6 });
    expect(contentOf(FLEET_FIVE_FORGES, { kind: 'agent', trackerId: TRACKER_IDS.exampleStorefront }).kindCounts).toEqual({ 'needs-user': 2, 'landed': 3 });
  });
});

describe('the page title\'s figures', () => {
  test('what needs User leads in orange, then today\'s landings and tokens as the side lists total them, then the brain\'s runs today', () => {
    expect(ActivityModel.titleFiguresOf(FLEET_FIVE_FORGES, ARTBOARD_CLOCK)).toEqual([
      { value: '5', label: 'need you', attention: true },
      { value: '6', label: 'landed today' },
      { value: '1.24M', label: 'tokens today' },
      { value: '2', label: 'brain runs today' },
    ]);
  });

  test('what needs User takes a + while a forge is not fully read, and with no forge reporting today or a brain only it stands', () => {
    const notFullyRead = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, incompleteFor: [TRACKER_IDS.researchWiki] } };
    expect(ActivityModel.titleFiguresOf(notFullyRead, ARTBOARD_CLOCK)[0]?.value).toBe('5+');
    const nobodyReports = withForges(FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, today: null, brain: 'not-reported' as const })));
    expect(ActivityModel.titleFiguresOf(nobodyReports, ARTBOARD_CLOCK).map((figure) => figure.label)).toEqual(['need you']);
  });
});

describe('landed today and tokens today', () => {
  test('each lists the forges that report today, in registry order, with a bar relative to the largest', () => {
    const { landedToday, tokensToday } = contentOf(FLEET_FIVE_FORGES);
    expect(landedToday.totalText).toBe('6');
    expect(landedToday.rows.map((row) => [row.project, row.valueText, row.meter?.used, row.meter?.whole])).toEqual([
      ['Example Storefront', '3', 3, 3],
      ['Invoice Service', '2', 2, 3],
      ['Research Wiki', '1', 1, 3],
      ['Example Mobile App', '0', 0, 3],
    ]);
    expect(tokensToday.totalText).toBe('1.24M');
    expect(tokensToday.rows.map((row) => [row.project, row.valueText, row.meter?.whole])).toEqual([
      ['Example Storefront', '512k', 512_000],
      ['Invoice Service', '418k', 512_000],
      ['Research Wiki', '164k', 512_000],
      ['Example Mobile App', '146k', 512_000],
    ]);
    expect(landedToday.rows[0]?.meter?.label).toBe('Example Storefront: 3 landed today');
  });

  test('a forge that reports no today is absent from both lists, not shown as 0', () => {
    const { landedToday, tokensToday } = contentOf(FLEET_FIVE_FORGES);
    for (const list of [landedToday, tokensToday]) {
      expect(list.rows.map((row) => row.trackerId)).not.toContain(TRACKER_IDS.designSystem);
      expect(list.rows.map((row) => row.trackerId)).not.toContain(TRACKER_IDS.legacyImporter);
    }
  });

  test('with no forge reporting today both lists are empty and carry no total; with nothing landed anywhere no bar is drawn', () => {
    const nobodyReports = withForges(FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, today: null })));
    expect(contentOf(nobodyReports).landedToday).toEqual({ totalText: null, rows: [] });
    expect(contentOf(nobodyReports).tokensToday).toEqual({ totalText: null, rows: [] });
    const nothingLanded = withForges(FLEET_FIVE_FORGES.forges.map((forge) => (forge.today === null ? forge : { ...forge, today: { ...forge.today, deliveredTickets: 0 } })));
    expect(contentOf(nothingLanded).landedToday.rows.map((row) => row.meter)).toEqual([null, null, null, null]);
    expect(contentOf(nothingLanded).landedToday.totalText).toBe('0');
  });
});

describe('the usage line', () => {
  test('forges under the limit share one line, since the limit is the machine\'s, with the clock time their current window resets', () => {
    expect(contentOf(FLEET_FIVE_FORGES).usageLines).toEqual(['under its limit · window resets 16:00']);
  });

  test('forges under the limit that report no current window say only that they are under it', () => {
    const noCurrentWindow = {
      window: null, resetsAt: null, currentWindow: null, currentWindowResetsAt: null
    };
    const underTheLimit = withForges(FLEET_FIVE_FORGES.forges.map((forge) => (forge.usage === null ? forge : { ...forge, usage: noCurrentWindow })));
    expect(contentOf(underTheLimit).usageLines).toEqual(['under its limit']);
  });

  test('a forge that hit the limit names its window and the clock time it resets', () => {
    const hitUsage = {
      window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z', currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T16:00:00.000Z',
    };
    const limitHit = withForges(FLEET_FIVE_FORGES.forges.map((forge) => (forge.usage === null ? forge : { ...forge, usage: hitUsage })));
    expect(contentOf(limitHit).usageLines).toEqual(['five-hour limit hit · resets 16:00']);
    const noWindow = withForges([{ ...READINGS.exampleStorefront, usage: { ...hitUsage, window: null }, }]);
    expect(contentOf(noWindow).usageLines).toEqual(['limit hit · resets 16:00']);
  });

  test('only the line of a forge that hit its limit is at the limit', () => {
    expect(contentOf(FLEET_FIVE_FORGES).usageLinesAtTheLimit).toEqual([]);
    const hitUsage = {
      window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z', currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T16:00:00.000Z',
    };
    const oneHit = withForges([READINGS.exampleStorefront, { ...READINGS.invoiceService, usage: hitUsage }]);
    expect(contentOf(oneHit).usageLines).toEqual(['under its limit · window resets 16:00', 'five-hour limit hit · resets 16:00']);
    expect(contentOf(oneHit).usageLinesAtTheLimit).toEqual(['five-hour limit hit · resets 16:00']);
  });

  test('when no forge reports usage there is no line', () => {
    expect(contentOf(withForges([READINGS.designSystem, READINGS.legacyImporter])).usageLines).toEqual([]);
  });
});

describe('Flint\'s brain on A3', () => {
  test('its entries fall under the Agents filter, and Landed and Needs you drop them', () => {
    const brainTexts = (kind: ActivityFilters['kind']) => contentOf(FLEET_FIVE_FORGES, { kind, trackerId: null }).rows
      .filter((row) => row.categoryWord === 'Flint\'s brain')
      .map((row) => row.clockTime);
    expect([brainTexts('agent'), brainTexts('landed'), brainTexts('needs-user'), brainTexts('forge')]).toEqual([['13:18', '12:46'], [], [], []]);
  });

  test('the brain runs today count each run that ended today and each brain running now: 2 at the artboard\'s clock', () => {
    const brainRunsOf = (fleetDocument: FleetDocument, clock: ClockReading = ARTBOARD_CLOCK) => ActivityModel.titleFiguresOf(fleetDocument, clock)
      .find((figure) => figure.label === 'brain runs today')?.value ?? null;
    expect(brainRunsOf(FLEET_FIVE_FORGES)).toBe('2');
    expect(brainRunsOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.ended))).toBe('1');
    expect(brainRunsOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.off))).toBe('1');
    expect(brainRunsOf(FLEET_FIVE_FORGES, NEXT_DAY_CLOCK)).toBe('1');
    expect(brainRunsOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.off), NEXT_DAY_CLOCK)).toBe('0');
  });

  test('the brain runs today are absent when no forge reports a brain, since no forge then serves monitor 3 with a Flint', () => {
    const noBrain = withForges(FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, brain: 'not-reported' as const })));
    expect(ActivityModel.titleFiguresOf(noBrain, ARTBOARD_CLOCK).map((figure) => figure.label)).toEqual(['need you', 'landed today', 'tokens today']);
  });

  test('the tokens-today note names the brain\'s part, the running brain\'s tokens and the ended run\'s, while the total stays the forges\' own', () => {
    const { brainTokensNote, tokensToday } = contentOf(FLEET_FIVE_FORGES);
    expect(brainTokensNote).toEqual({
      totalText: '7.3k',
      forges:    [
        { trackerId: TRACKER_IDS.exampleStorefront, project: 'Example Storefront', tokensText: '3.1k' },
        { trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service', tokensText: '4.2k' },
      ],
    });
    expect(tokensToday.totalText).toBe('1.24M');
    expect(tokensToday).toEqual(contentOf(withStorefrontBrain('not-reported')).tokensToday);
  });

  test('the note follows each brain: ended or not reported, the storefront\'s part leaves; the next day, the ended run\'s leaves', () => {
    const invoiceOnly = [{ trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service', tokensText: '4.2k' }];
    expect(contentOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.ended)).brainTokensNote).toEqual({ totalText: '4.2k', forges: invoiceOnly });
    expect(contentOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.refused)).brainTokensNote).toEqual({ totalText: '4.2k', forges: invoiceOnly });
    expect(contentOf(withStorefrontBrain('not-reported')).brainTokensNote).toEqual({ totalText: '4.2k', forges: invoiceOnly });
    expect(contentOf(FLEET_FIVE_FORGES, EVERY_ENTRY, NEXT_DAY_CLOCK).brainTokensNote?.forges.map((forge) => forge.project)).toEqual(['Example Storefront']);
  });

  test('a forge whose kept entries were cut within the day may hold more ended runs: its runs and its brain tokens read as at least', () => {
    const [newest] = FLEET_FIVE_FORGES.activity.filter((entry) => entry.trackerId === TRACKER_IDS.invoiceService && entry.kind === 'flint-brain');
    if (newest === undefined) throw new Error('The fixture holds no ended brain run of Invoice Service.');
    const fillers = Array.from({ length: LIMITS.activityEntriesShownPerForge - 1 }, (_filler, i) => ({
      ...newest, logPosition: newest.logPosition - 1 - i, kind: null, tokens: null, category: 'forge' as const, text: 'Example filler entry',
    }));
    const otherEntries = FLEET_FIVE_FORGES.activity.filter((entry) => entry.trackerId !== TRACKER_IDS.invoiceService);
    const cutToday: FleetDocument = { ...FLEET_FIVE_FORGES, activity: [...otherEntries, newest, ...fillers] };
    expect(ActivityModel.titleFiguresOf(cutToday, ARTBOARD_CLOCK).find((figure) => figure.label === 'brain runs today')?.value).toBe('2+');
    expect(contentOf(cutToday).brainTokensNote).toEqual({
      totalText: '7.3k+',
      forges:    [
        { trackerId: TRACKER_IDS.exampleStorefront, project: 'Example Storefront', tokensText: '3.1k' },
        { trackerId: TRACKER_IDS.invoiceService, project: 'Invoice Service', tokensText: '4.2k+' },
      ],
    });
  });

  test('the note is absent when no brain ran today', () => {
    expect(contentOf(withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.off), EVERY_ENTRY, NEXT_DAY_CLOCK).brainTokensNote).toBeNull();
    const noBrainEntries = { ...withStorefrontBrain(FLEET_FIVE_FORGES_BRAINS.off), activity: FLEET_FIVE_FORGES.activity.filter((entry) => entry.kind !== 'flint-brain') };
    expect(contentOf(noBrainEntries).brainTokensNote).toBeNull();
  });
});
