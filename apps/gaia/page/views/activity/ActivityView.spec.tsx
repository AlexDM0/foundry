/**
 * The Activity view (SCREENS A3) as it is laid out. What matters: with `fleet-five-forges` the table holds the artboard's eighteen rows,
 * interleaved across forges newest first, each with its clock time, forge, category and the forge's own text (acceptance 1); the side
 * lists hold only the forges that report today (acceptance 2); each filter hands its choice on; past three forges the rest open from the
 * package's menu as the tray's last segment, which names the chosen one and hands its closing on; a row links into its forge only when it
 * has a route; every empty place says so in its own words; and version 2's look (SCREENS A3): Needs you and Landed carry their counts,
 * the side lists are cards with a mono total, the usage dot says under or at the limit beside the words with its reset time in mono, and
 * the page title carries the view's figures. Flint's brain (R4.6): its rows carry the diamond and "Flint's brain", and under the tokens'
 * bars a note names its part per forge in mono, absent when no brain ran today.
 *
 * `ActivityLayout` takes no hooks and unfolds, its package parts folded; `ActivityView`, which keeps the filters, is rendered with React's
 * own server renderer, which runs its hooks without a document, and is held to the layout it opens on.
 */
import { describe, expect, test } from 'bun:test';
import { Card }                   from 'design-system/Card';
import { EmptyState }             from 'design-system/EmptyState';
import { FillMeter }              from 'design-system/FillMeter';
import { Menu, MenuItem }         from 'design-system/Menu';
import { SegmentedControl }       from 'design-system/SegmentedControl';
import { Stamp }                  from 'design-system/Stamp';
import { StateDot }               from 'design-system/StateDot';
import { Text }                   from 'design-system/Text';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import type { ClockReading }                                                        from '../../shared/@types/ClockReading.ts';
import { DataTableRows }                                                            from '../../testing/DataTableRows.ts';
import { DrawnDots }                                                                from '../../testing/DrawnDots.ts';
import { type HostElement, ReactElementTree }                                       from '../../testing/ReactElementTree.ts';
import { FLEET_EMPTY }                                                              from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  type ActivityFilters,
  type ActivityKindFilter,
  ActivityModel,
  EVERY_ENTRY,
} from './ActivityModel.ts';
import {
  ActivityLayout,
  type ActivityLayoutProps,
  ActivityView,
  activityViewPartsOf,
} from './ActivityView.tsx';

const tree = ReactElementTree;
const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const ARTBOARD_CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

interface Handled {
  readonly kinds:           ActivityKindFilter[];
  readonly forges:          (string | null)[];
  readonly menuOpenChanges: boolean[];
}

function layoutPropsOf(fleetDocument: FleetDocument, filters: ActivityFilters, menuIsOpen = false, handled?: Handled): ActivityLayoutProps {
  return {
    content:          ActivityModel.activityContentOf(fleetDocument, filters, ARTBOARD_CLOCK),
    kindFilter:       filters.kind,
    menuIsOpen,
    onKindFilter:     (kind) => handled?.kinds.push(kind),
    onForgeChoice:    (trackerId) => handled?.forges.push(trackerId),
    onMenuOpenChange: (isOpen) => handled?.menuOpenChanges.push(isOpen),
  };
}

function layoutOf(fleetDocument: FleetDocument, filters: ActivityFilters = EVERY_ENTRY, menuIsOpen = false) {
  const handled: Handled = { kinds: [], forges: [], menuOpenChanges: [] };
  return { unfolded: tree.unfolded(<ActivityLayout {...layoutPropsOf(fleetDocument, filters, menuIsOpen, handled)} />), handled };
}

interface HandedSegment {
  readonly value:  string;
  readonly label:  string;
  readonly count?: number;
}

/** The package's segmented control Gaia names by the label element it hands it. */
function groupNamed(unfolded: ReturnType<typeof tree.unfolded>, name: string): HostElement {
  const label = tree.onlyHostElementIn(unfolded, (element) => typeof element.props['id'] === 'string' && tree.textOf([element]) === name);
  return tree.onlyHostElementIn(unfolded, (element) => tree.withComponent(SegmentedControl)(element) && element.props['labelledBy'] === label.props['id']);
}

/** Each segment Gaia hands a segmented control, by its label, its count where it has one, and whether it is the selected one. */
function segmentsOf(group: HostElement): (readonly [string, number | null, boolean])[] {
  return (group.props['options'] as readonly HandedSegment[]).map((option) => [option.label, option.count ?? null, option.value === group.props['selected']]);
}

/** The package menu that trails the forge filter's tray, holding the forges past the first three; none with three forges or fewer. */
function forgeMenusOf(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(tree.unfoldedProp(groupNamed(unfolded, 'Forge'), 'trailing'), tree.withComponent(Menu));
}

/** The forge filter: its segments, then the menu's segment for the forges past the first three, each by its words and whether it is pressed. */
function forgeFilterOf(unfolded: ReturnType<typeof tree.unfolded>): (readonly [string, unknown])[] {
  const segments = segmentsOf(groupNamed(unfolded, 'Forge')).map(([label, , selected]) => [label, selected] as const);
  const menuSegments = forgeMenusOf(unfolded).map((menu) => [tree.textOf(tree.unfoldedProp(menu, 'triggerContent')), menu.props['pressed']] as const);
  return [...segments, ...menuSegments];
}

/** Picks a segment as a press of it would, handing its value on. */
function choose(group: HostElement, label: string): void {
  const option = (group.props['options'] as readonly HandedSegment[]).find((segment) => segment.label === label);
  if (option === undefined) throw new Error(`The segment ${label} is missing.`);
  tree.dispatch(group, 'onSelect', option.value);
}

function bodyRowsIn(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return DataTableRows.rowsIn(unfolded);
}

/** The text a reader sees in each cell of a row, the time column's by the short text Gaia hands its stamp, which stays folded. */
function cellTextsOf(row: HostElement): string[] {
  return DataTableRows.cellsOf(row).map((cell) => {
    const stamps = tree.hostElementsIn([cell], tree.withComponent(Stamp));
    return stamps.length === 0 ? tree.textOf([cell]) : stamps.map((stamp) => String(stamp.props['shortText'])).join('');
  });
}

describe('the table', () => {
  test('with fleet-five-forges it holds the artboard\'s eighteen rows, interleaved across forges newest first', () => {
    const rows = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    expect(rows).toHaveLength(18);
    expect(rows.slice(0, 6).map(cellTextsOf)).toEqual([
      ['13:18', 'Example Storefront', 'Flint\'s brain', 'Flint\'s brain started through the API · haiku low · 2:00 at most'],
      ['13:16', 'Example Storefront', 'Agent', 'J4 builder started on #013 Product image zoom'],
      ['13:15', 'Example Storefront', 'Needs you', 'J3 asked E2: How long should a password reset link stay valid?'],
      ['13:07', 'Invoice Service', 'Needs you', '#031 Round VAT per line, not per invoice was reviewed and waits for your accept'],
      ['13:05', 'Example Storefront', 'Landed', '#010 Wishlist sharing landed on main'],
      ['13:02', 'Invoice Service', 'Agent', 'J14 reviewer started on #032 VAT rounding rules'],
    ]);
    const times = tree.hostElementsIn(rows, tree.withComponent(Stamp)).map((stamp) => [stamp.props['element'], stamp.props['dateTime']]);
    expect(times).toEqual(FLEET_FIVE_FORGES.activity.map((entry) => ['time', entry.at]));
  });

  test('a row with a route is a link into its forge, a row without one is plain text, and the forge\'s text is shown whole as its title', () => {
    const rows = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    const [brainStart, newestJob] = rows;
    if (brainStart === undefined || newestJob === undefined) throw new Error('The table holds no row.');
    expect([tree.hostElementsIn([brainStart], tree.withTag('a')), brainStart.props['interactive']]).toEqual([[], false]);
    const link = tree.onlyWithTag([newestJob], 'a');
    expect([link.props['href'], link.props['title'], newestJob.props['interactive']])
      .toEqual([`#forge/${TRACKER_IDS.exampleStorefront}/agents/J4`, 'J4 builder started on #013 Product image zoom', true]);
    const heldRow = rows.find((row) => tree.textOf([row]).includes('Launches held'));
    if (heldRow === undefined) throw new Error('The held forge\'s entry is missing.');
    expect(tree.hostElementsIn([heldRow], tree.withTag('a'))).toEqual([]);
  });

  test('each row\'s category shows its dot, the brain\'s the diamond, and an agent whose job ended keeps its place without one', () => {
    const [brainStart, newest] = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    if (brainStart === undefined || newest === undefined) throw new Error('The table holds no row.');
    expect(DrawnDots.roleOf(tree.onlyHostElementIn([brainStart], DrawnDots.isDot))).toBe('brain');
    expect(DrawnDots.roleOf(tree.onlyHostElementIn([newest], DrawnDots.isDot))).toBe('builder');
    const storefront = FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? { ...forge, agents: [] } : forge));
    const [, withoutJob] = bodyRowsIn(layoutOf({ ...FLEET_FIVE_FORGES, forges: storefront }).unfolded);
    if (withoutJob === undefined) throw new Error('The table holds no row.');
    expect(tree.hostElementsIn([withoutJob], DrawnDots.isDot)).toEqual([]);
    expect(tree.onlyWithClass([withoutJob], 'gaia-activity-dot-space').props['aria-hidden']).toBe('true');
  });

  test('with no entry at all the table\'s place says so, and with none that the filters keep it says that', () => {
    const empty = layoutOf(FLEET_EMPTY).unfolded;
    expect(bodyRowsIn(empty)).toEqual([]);
    expect(tree.onlyOfComponent([tree.onlyWithClass(empty, 'gaia-activity-entries')], EmptyState).props['text']).toBe('No forge has reported activity yet.');
    const filteredAway = layoutOf(FLEET_FIVE_FORGES, { kind: 'forge', trackerId: TRACKER_IDS.invoiceService }).unfolded;
    expect(tree.onlyOfComponent([tree.onlyWithClass(filteredAway, 'gaia-activity-entries')], EmptyState).props['text']).toBe('No entry matches these filters.');
  });
});

describe('the filters', () => {
  test('the kind filter offers the five kinds, presses the chosen one and hands a new choice on', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { kind: 'needs-user', trackerId: null });
    const kinds = groupNamed(unfolded, 'Kind');
    expect(segmentsOf(kinds)).toEqual([
      ['Everything', null, false], ['Needs you', 5, true], ['Landed', 6, false], ['Agents', null, false], ['Forge', null, false],
    ]);
    choose(kinds, 'Landed');
    expect(handled.kinds).toEqual(['landed']);
  });

  test('the forge filter offers every forge, then the first three, then a menu of the other two', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    expect(forgeFilterOf(unfolded)).toEqual([
      ['All forges', true], ['Example Storefront', false], ['Invoice Service', false], ['Research Wiki', false], ['2 more', false],
    ]);
    choose(groupNamed(unfolded, 'Forge'), 'Example Storefront');
    choose(groupNamed(unfolded, 'Forge'), 'All forges');
    expect(handled.forges).toEqual([TRACKER_IDS.exampleStorefront, null]);
  });

  test('the menu is the tray\'s last segment, open as the view keeps it, and hands the chosen forge on', () => {
    const closed = layoutOf(FLEET_FIVE_FORGES);
    const [closedMenu] = forgeMenusOf(closed.unfolded);
    if (closedMenu === undefined) throw new Error('The forge menu is missing.');
    expect(['label', 'trigger', 'isOpen'].map((propName) => closedMenu.props[propName])).toEqual(['More forges', 'segment', false]);
    tree.dispatch(closedMenu, 'onOpenChange', true);
    expect(closed.handled.menuOpenChanges).toEqual([true]);

    const open = layoutOf(FLEET_FIVE_FORGES, EVERY_ENTRY, true);
    const [menu] = forgeMenusOf(open.unfolded);
    if (menu === undefined) throw new Error('The forge menu is missing.');
    expect(menu.props['isOpen']).toBe(true);
    const items = tree.hostElementsIn([menu], tree.withComponent(MenuItem));
    expect(items.map((item) => [item.props['label'], item.props['pressed'], item.props['closing']])).toEqual([
      ['Example Mobile App', false, 'return-focus'],
      ['Design System', false, 'return-focus'],
    ]);
    const [, designSystem] = items;
    if (designSystem === undefined) throw new Error('The Design System item is missing.');
    tree.dispatch(designSystem, 'onChoose');
    expect(open.handled.forges).toEqual([TRACKER_IDS.designSystem]);
  });

  test('a forge chosen from the menu names the menu\'s segment and presses it, and no other segment', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES, { kind: 'everything', trackerId: TRACKER_IDS.designSystem });
    expect(forgeFilterOf(unfolded)).toEqual([
      ['All forges', false], ['Example Storefront', false], ['Invoice Service', false], ['Research Wiki', false], ['Design System', true],
    ]);
    expect(bodyRowsIn(unfolded).map(cellTextsOf)).toEqual([['12:20', 'Design System', 'Forge', 'Overseer stopped']]);
  });

  test('the menu\'s own close, on Escape or a press outside it, is handed on to the view', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, EVERY_ENTRY, true);
    const [menu] = forgeMenusOf(unfolded);
    if (menu === undefined) throw new Error('The forge menu is missing.');
    tree.dispatch(menu, 'onOpenChange', false);
    expect(handled.menuOpenChanges).toEqual([false]);
  });

  test('with three forges or fewer there is no menu', () => {
    const menuForges = new Set<string>([TRACKER_IDS.exampleMobileApp, TRACKER_IDS.designSystem]);
    const threeForges = { ...FLEET_FIVE_FORGES, activity: FLEET_FIVE_FORGES.activity.filter((entry) => !menuForges.has(entry.trackerId)) };
    const { unfolded } = layoutOf(threeForges);
    expect(forgeFilterOf(unfolded).map(([words]) => words)).toEqual(['All forges', 'Example Storefront', 'Invoice Service', 'Research Wiki']);
    expect(groupNamed(unfolded, 'Forge').props['trailing']).toBeUndefined();
  });
});

describe('the side lists', () => {
  test('landed today and tokens today list the forges that report today, and a forge that reports none is absent, not 0', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const sections = tree.hostElementsIn(unfolded, tree.withClass('gaia-activity-side-section'));
    const headOf = (section: HostElement) => tree.onlyHostElementIn([section], (element) => element.tag === Text.name && element.props['element'] === 'h2');
    expect(sections.map((section) => tree.textOf([headOf(section)]))).toEqual(['Landed today · 6', 'Tokens today · 1.24M']);
    const rowsOf = (section: HostElement | undefined) => tree.hostElementsIn(section === undefined ? [] : [section], tree.withClass('gaia-activity-today-row'))
      .map((row) => [tree.textOf([tree.onlyWithClass([row], 'gaia-activity-today-project')]), tree.textOf([tree.onlyWithClass([row], 'gaia-activity-today-value')])]);
    expect(rowsOf(sections[0])).toEqual([['Example Storefront', '3'], ['Invoice Service', '2'], ['Research Wiki', '1'], ['Example Mobile App', '0']]);
    expect(rowsOf(sections[1])).toEqual([['Example Storefront', '512k'], ['Invoice Service', '418k'], ['Research Wiki', '164k'], ['Example Mobile App', '146k']]);
    expect(tree.textOf(unfolded)).not.toContain('Design System0');
  });

  test('each bar is relative to the largest, in the landed tone for landings, and never warns at the largest', () => {
    const meters = tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withComponent(FillMeter));
    expect(meters.slice(0, 4).map((meter) => [meter.props['tone'], meter.props['near']])).toEqual([
      ['success', false], ['success', false], ['success', false], ['success', false],
    ]);
    expect(meters.slice(4).map((meter) => [meter.props['tone'], meter.props['near']])).toEqual(Array(4).fill(['neutral', false]));
    const shares = meters.map((meter) => Number(meter.props['used']) / Number(meter.props['limit']));
    expect(shares.slice(4)).toEqual([1, 418 / 512, 164 / 512, 146 / 512]);
  });

  test('the usage line is the forges\' reading, and with no forge reporting today or usage the lists say so and the usage is absent', () => {
    const usageLine = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES).unfolded, 'gaia-activity-usage-line');
    expect([tree.textOf([usageLine]), tree.onlyOfComponent([usageLine], Stamp).props['shortText']]).toEqual(['under its limit · window resets ', '16:00']);
    const empty = layoutOf(FLEET_EMPTY).unfolded;
    const side = tree.onlyWithClass(empty, 'gaia-activity-side');
    const sideSentences = tree.hostElementsIn([side], tree.withComponent(EmptyState)).map((sentence) => sentence.props['text']);
    expect(sideSentences).toEqual(['No forge reports it.', 'No forge reports it.']);
    expect(tree.hostElementsIn(empty, tree.withClass('gaia-activity-usage'))).toEqual([]);
  });
});

describe('Flint\'s brain on the tokens-today card', () => {
  test('under the bars a note with the diamond names the brain\'s part of the total and each forge\'s, every figure in mono', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const [, tokensSection] = tree.hostElementsIn(unfolded, tree.withClass('gaia-activity-side-section'));
    if (tokensSection === undefined) throw new Error('The tokens-today card is missing.');
    const note = tree.onlyWithClass([tokensSection], 'gaia-activity-brain-note');
    expect(tree.textOf([note])).toBe('Includes 7.3k of Flint\'s brain: Example Storefront 3.1k, Invoice Service 4.2k.');
    expect(tree.hostElementsIn([note], DrawnDots.isDot).map(DrawnDots.roleOf)).toEqual(['brain']);
    expect(tree.hostElementsIn([note], tree.withClass('gaia-activity-brain-note-figure')).map((figure) => tree.textOf([figure]))).toEqual(['7.3k', '3.1k', '4.2k']);
  });

  test('with no brain today the note is absent, and the landed card never has one', () => {
    const noBrainToday: FleetDocument = {
      ...FLEET_FIVE_FORGES,
      forges:   FLEET_FIVE_FORGES.forges.map((forge) => (forge.brain === 'not-reported' ? forge : { ...forge, brain: { ...forge.brain, state: 'off' as const } })),
      activity: FLEET_FIVE_FORGES.activity.filter((entry) => entry.kind !== 'flint-brain'),
    };
    expect(tree.hostElementsIn(layoutOf(noBrainToday).unfolded, tree.withClass('gaia-activity-brain-note'))).toEqual([]);
    const [landedSection] = tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withClass('gaia-activity-side-section'));
    expect(tree.hostElementsIn(landedSection === undefined ? [] : [landedSection], tree.withClass('gaia-activity-brain-note'))).toEqual([]);
  });
});

describe('the look of the parts', () => {
  test('each side list is a card, its total in mono, and the usage reading has a neutral dot under the limit and an orange one at it', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const sections = tree.hostElementsIn(unfolded, tree.withClass('gaia-activity-side-section'));
    expect(sections.map((section) => tree.hostElementsIn([section], tree.withComponent(Card)).length)).toEqual([1, 1]);
    const totals = sections.map((section) => tree.onlyHostElementIn([section], (element) => element.tag === Text.name && element.props['mono'] === true));
    expect(totals.map((total) => tree.textOf([total]))).toEqual(['6', '1.24M']);
    const toneOfReading = (filters: ActivityFilters, fleetDocument: FleetDocument) => {
      const usage = tree.onlyWithClass(tree.unfolded(<ActivityLayout {...layoutPropsOf(fleetDocument, filters)} />), 'gaia-activity-usage');
      return tree.onlyOfComponent([usage], StateDot).props['tone'];
    };
    expect(toneOfReading(EVERY_ENTRY, FLEET_FIVE_FORGES)).toBe('neutral');
    const hitUsage = {
      window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z', currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T16:00:00.000Z',
    };
    const limitHit = { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.usage === null ? forge : { ...forge, usage: hitUsage })) };
    expect(toneOfReading(EVERY_ENTRY, limitHit)).toBe('accent');
  });

  test('the usage reading sets the clock time its window resets as a mono stamp, with its month and day when not today, and a reading with no clock time has none', () => {
    const stampsOf = (fleetDocument: FleetDocument) => {
      const line = tree.onlyWithClass(layoutOf(fleetDocument).unfolded, 'gaia-activity-usage-line');
      return { text: tree.textOf([line]), stamps: tree.hostElementsIn([line], tree.withComponent(Stamp)).map((stamp) => stamp.props['shortText']) };
    };
    expect(stampsOf(FLEET_FIVE_FORGES)).toEqual({ text: 'under its limit · window resets ', stamps: ['16:00'] });
    const noWindowUsage = {
      window: null, resetsAt: null, currentWindow: null, currentWindowResetsAt: null,
    };
    const noClockTime = {
      ...FLEET_FIVE_FORGES,
      forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.usage === null ? forge : { ...forge, usage: noWindowUsage })),
    };
    expect(stampsOf(noClockTime)).toEqual({ text: 'under its limit', stamps: [] });
    const tomorrowUsage = { ...noWindowUsage, currentWindowResetsAt: '2026-11-13T16:00:00.000Z' };
    const resetsTomorrow = {
      ...FLEET_FIVE_FORGES,
      forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.usage === null ? forge : { ...forge, usage: tomorrowUsage })),
    };
    expect(stampsOf(resetsTomorrow)).toEqual({ text: 'under its limit · window resets ', stamps: ['11-13 16:00'] });
  });

  test('the page title carries the view\'s figures once the first fleet document is in', () => {
    expect(activityViewPartsOf(null, ARTBOARD_CLOCK).figures).toEqual([]);
    expect(activityViewPartsOf(FLEET_FIVE_FORGES, ARTBOARD_CLOCK).figures.map((figure) => [figure.value, figure.label])).toEqual([
      ['5', 'need you'], ['6', 'landed today'], ['1.24M', 'tokens today'], ['2', 'brain runs today'],
    ]);
  });
});

describe('the view with its filters', () => {
  test('it opens on every entry of every forge, with the menu closed', () => {
    const markup = renderToStaticMarkup(<ActivityView fleetDocument={FLEET_FIVE_FORGES} clock={ARTBOARD_CLOCK} />);
    expect(markup).toBe(renderToStaticMarkup(<ActivityLayout {...layoutPropsOf(FLEET_FIVE_FORGES, EVERY_ENTRY)} />));
    expect(markup.match(/<span class="gaia-activity-at"><time class="design-system-stamp" dateTime="/g)).toHaveLength(18);
    expect(markup).toContain('aria-pressed="false" aria-haspopup="dialog" aria-expanded="false"');
  });
});
