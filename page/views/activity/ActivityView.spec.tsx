/**
 * The Activity view (SCREENS A3) as it is laid out. What matters: with `fleet-five-forges` the table holds the artboard's sixteen rows,
 * interleaved across forges newest first, each with its clock time, forge, category and the forge's own text (acceptance 1); the side lists
 * hold only the forges that report today (acceptance 2); each filter hands its choice on; past three forges the rest open from a menu that
 * names the chosen one and closes on Escape and when focus leaves it; a row links into its forge only when it has a route; and every empty
 * place says so in its own words.
 *
 * `ActivityLayout` takes no hooks and unfolds to its host elements; `ActivityView`, which keeps the filters, is rendered with React's own
 * server renderer, which runs its hooks without a document.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument }                               from '../../@types/FleetDocument.ts';
import { type HostElement, ReactElementTree }               from '../../testing/ReactElementTree.ts';
import { FLEET_EMPTY }                                      from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  type ActivityFilters,
  type ActivityKindFilter,
  ActivityModel,
  EVERY_ENTRY,
} from './ActivityModel.ts';
import { ActivityLayout, type ActivityLayoutProps, ActivityView } from './ActivityView.tsx';

const tree = ReactElementTree;
const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;
const FIXTURE_TIME_ZONE = 'UTC';

interface Handled {
  readonly kinds:       ActivityKindFilter[];
  readonly forges:      (string | null)[];
  readonly menuToggles: number[];
  readonly menuCloses:  number[];
}

function layoutOf(fleetDocument: FleetDocument, filters: ActivityFilters = EVERY_ENTRY, menuIsOpen = false) {
  const handled: Handled = {
    kinds: [], forges: [], menuToggles: [], menuCloses: [],
  };
  const props: ActivityLayoutProps = {
    content:       ActivityModel.activityContentOf(fleetDocument, filters, FIXTURE_TIME_ZONE),
    kindFilter:    filters.kind,
    menuIsOpen,
    onKindFilter:  (kind) => handled.kinds.push(kind),
    onForgeChoice: (trackerId) => handled.forges.push(trackerId),
    onMenuToggle:  () => handled.menuToggles.push(1),
    onMenuClose:   () => handled.menuCloses.push(1),
  };
  return { unfolded: tree.unfolded(<ActivityLayout {...props} />), handled };
}

function groupNamed(unfolded: ReturnType<typeof tree.unfolded>, name: string): HostElement {
  return tree.onlyHostElementIn(unfolded, (element) => element.props['role'] === 'group' && element.props['aria-label'] === name);
}

function bodyRowsIn(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(unfolded, (element) => element.props['role'] === 'row' && element.props['data-head'] === undefined);
}

function cellTextsOf(row: HostElement): string[] {
  return tree.hostElementsIn([row], (element) => element.props['role'] === 'cell').map((cell) => tree.textOf([cell]));
}

function buttonsIn(group: HostElement): HostElement[] {
  return tree.hostElementsIn([group], tree.withTag('button'));
}

describe('the table', () => {
  test('with fleet-five-forges it holds the artboard\'s sixteen rows, interleaved across forges newest first', () => {
    const rows = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    expect(rows).toHaveLength(16);
    expect(rows.slice(0, 5).map(cellTextsOf)).toEqual([
      ['13:16', 'Example Storefront', 'Agent', 'J4 builder started on #013 Product image zoom'],
      ['13:15', 'Example Storefront', 'Needs you', 'J3 asked E2: How long should a password reset link stay valid?'],
      ['13:07', 'Invoice Service', 'Needs you', '#031 Round VAT per line, not per invoice was reviewed and waits for your accept'],
      ['13:05', 'Example Storefront', 'Landed', '#010 Wishlist sharing landed on main'],
      ['13:02', 'Invoice Service', 'Agent', 'J14 reviewer started on #032 VAT rounding rules'],
    ]);
    const times = tree.hostElementsIn(rows, tree.withTag('time')).map((time) => time.props['dateTime']);
    expect(times).toEqual(FLEET_FIVE_FORGES.activity.map((entry) => entry.at));
  });

  test('a row with a route is a link into its forge, a row without one is plain text, and the forge\'s text is shown whole as its title', () => {
    const rows = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    const [newest] = rows;
    if (newest === undefined) throw new Error('The table holds no row.');
    const link = tree.onlyWithTag([newest], 'a');
    expect([link.props['href'], link.props['title']]).toEqual([`#forge/${TRACKER_IDS.exampleStorefront}/#agents/J4`, 'J4 builder started on #013 Product image zoom']);
    const heldRow = rows.find((row) => tree.textOf([row]).includes('Launches held'));
    if (heldRow === undefined) throw new Error('The held forge\'s entry is missing.');
    expect(tree.hostElementsIn([heldRow], tree.withTag('a'))).toEqual([]);
  });

  test('each row\'s category shows its dot, and an agent whose job ended keeps its place without one', () => {
    const [newest] = bodyRowsIn(layoutOf(FLEET_FIVE_FORGES).unfolded);
    if (newest === undefined) throw new Error('The table holds no row.');
    expect(tree.onlyWithClass([newest], 'gaia-role-dot').props['data-role']).toBe('builder');
    const storefront = FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? { ...forge, agents: [] } : forge));
    const [withoutJob] = bodyRowsIn(layoutOf({ ...FLEET_FIVE_FORGES, forges: storefront }).unfolded);
    if (withoutJob === undefined) throw new Error('The table holds no row.');
    expect(tree.hostElementsIn([withoutJob], tree.withClass('gaia-role-dot'))).toEqual([]);
    expect(tree.onlyWithClass([withoutJob], 'gaia-activity-dot-space').props['aria-hidden']).toBe('true');
  });

  test('with no entry at all the table\'s place says so, and with none that the filters keep it says that', () => {
    const empty = layoutOf(FLEET_EMPTY).unfolded;
    expect(tree.hostElementsIn(empty, (element) => element.props['role'] === 'table')).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(empty, 'gaia-activity-empty')])).toBe('No forge has reported activity yet.');
    const filteredAway = layoutOf(FLEET_FIVE_FORGES, { kind: 'forge', trackerId: TRACKER_IDS.invoiceService }).unfolded;
    expect(tree.textOf([tree.onlyWithClass(filteredAway, 'gaia-activity-empty')])).toBe('No entry matches these filters.');
  });
});

describe('the filters', () => {
  test('the kind filter offers the five kinds, presses the chosen one and hands a new choice on', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { kind: 'needs-user', trackerId: null });
    const kinds = buttonsIn(groupNamed(unfolded, 'Kind'));
    expect(kinds.map((button) => [tree.textOf([button]), button.props['aria-pressed']])).toEqual([
      ['Everything', false], ['Needs you', true], ['Landed', false], ['Agents', false], ['Forge', false],
    ]);
    const landed = kinds[2];
    if (landed === undefined) throw new Error('The Landed segment is missing.');
    tree.dispatch(landed, 'onClick');
    expect(handled.kinds).toEqual(['landed']);
  });

  test('the forge filter offers every forge, then the first three, then a menu of the other two', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const forges = buttonsIn(groupNamed(unfolded, 'Forge'));
    expect(forges.map((button) => [tree.textOf([button]), button.props['aria-pressed']])).toEqual([
      ['All forges', true], ['Example Storefront', false], ['Invoice Service', false], ['Research Wiki', false], ['2 more▾', false],
    ]);
    const [allForges, storefront] = forges;
    if (allForges === undefined || storefront === undefined) throw new Error('A forge segment is missing.');
    tree.dispatch(storefront, 'onClick');
    tree.dispatch(allForges, 'onClick');
    expect(handled.forges).toEqual([TRACKER_IDS.exampleStorefront, null]);
  });

  test('the menu opens from its segment and hands the chosen forge on', () => {
    const closed = layoutOf(FLEET_FIVE_FORGES);
    const toggle = buttonsIn(groupNamed(closed.unfolded, 'Forge')).at(-1);
    if (toggle === undefined) throw new Error('The menu segment is missing.');
    expect(toggle.props['aria-expanded']).toBe(false);
    expect(tree.hostElementsIn(closed.unfolded, tree.withClass('gaia-activity-forge-menu'))).toEqual([]);
    tree.dispatch(toggle, 'onClick');
    expect(closed.handled.menuToggles).toHaveLength(1);

    const open = layoutOf(FLEET_FIVE_FORGES, EVERY_ENTRY, true);
    const menu = tree.onlyWithClass(open.unfolded, 'gaia-activity-forge-menu');
    expect(menu.props['aria-label']).toBe('More forges');
    const items = buttonsIn(menu);
    expect(items.map((item) => tree.textOf([item]))).toEqual(['Example Mobile App', 'Design System']);
    const [, designSystem] = items;
    if (designSystem === undefined) throw new Error('The Design System item is missing.');
    tree.dispatch(designSystem, 'onClick');
    expect(open.handled.forges).toEqual([TRACKER_IDS.designSystem]);
  });

  test('a forge chosen from the menu names the menu\'s segment and presses it, and no other segment', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES, { kind: 'everything', trackerId: TRACKER_IDS.designSystem });
    const forges = buttonsIn(groupNamed(unfolded, 'Forge'));
    expect(forges.map((button) => [tree.textOf([button]), button.props['aria-pressed']])).toEqual([
      ['All forges', false], ['Example Storefront', false], ['Invoice Service', false], ['Research Wiki', false], ['Design System▾', true],
    ]);
    expect(bodyRowsIn(unfolded).map(cellTextsOf)).toEqual([['12:20', 'Design System', 'Forge', 'Overseer stopped']]);
  });

  test('the menu closes on Escape and when focus leaves it, and stays open while focus moves inside it', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, EVERY_ENTRY, true);
    const holder = tree.onlyWithClass(unfolded, 'gaia-activity-more-forges');
    tree.dispatch(holder, 'onKeyDown', { key: 'ArrowDown' });
    tree.dispatch(holder, 'onKeyDown', { key: 'Escape' });
    const inside = { contains: (target: unknown) => target === 'an item of the menu' };
    tree.dispatch(holder, 'onBlur', { currentTarget: inside, relatedTarget: 'an item of the menu' });
    tree.dispatch(holder, 'onBlur', { currentTarget: inside, relatedTarget: 'the table' });
    tree.dispatch(holder, 'onBlur', { currentTarget: inside, relatedTarget: null });
    expect(handled.menuCloses).toHaveLength(3);
  });

  test('with three forges or fewer there is no menu', () => {
    const menuForges = new Set<string>([TRACKER_IDS.exampleMobileApp, TRACKER_IDS.designSystem]);
    const threeForges = { ...FLEET_FIVE_FORGES, activity: FLEET_FIVE_FORGES.activity.filter((entry) => !menuForges.has(entry.trackerId)) };
    const { unfolded } = layoutOf(threeForges);
    expect(buttonsIn(groupNamed(unfolded, 'Forge')).map((button) => tree.textOf([button]))).toEqual(['All forges', 'Example Storefront', 'Invoice Service', 'Research Wiki']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-activity-more-forges'))).toEqual([]);
  });
});

describe('the side lists', () => {
  test('landed today and tokens today list the forges that report today, and a forge that reports none is absent, not 0', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const sections = tree.hostElementsIn(unfolded, tree.withClass('gaia-activity-side-section'));
    expect(sections.map((section) => tree.textOf([tree.onlyWithTag([section], 'h2')]))).toEqual(['Landed today · 6', 'Tokens today · 1.24M']);
    const rowsOf = (section: HostElement | undefined) => tree.hostElementsIn(section === undefined ? [] : [section], tree.withClass('gaia-activity-today-row'))
      .map((row) => [tree.textOf([tree.onlyWithClass([row], 'gaia-activity-today-project')]), tree.textOf([tree.onlyWithClass([row], 'gaia-activity-today-value')])]);
    expect(rowsOf(sections[0])).toEqual([['Example Storefront', '3'], ['Invoice Service', '2'], ['Research Wiki', '1'], ['Example Mobile App', '0']]);
    expect(rowsOf(sections[1])).toEqual([['Example Storefront', '512k'], ['Invoice Service', '418k'], ['Research Wiki', '164k'], ['Example Mobile App', '146k']]);
    expect(tree.textOf(unfolded)).not.toContain('Design System0');
  });

  test('each bar is relative to the largest, in the landed tone for landings, and never warns at the largest', () => {
    const meters = tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withClass('gaia-meter'));
    expect(meters.slice(0, 4).map((meter) => [meter.props['data-tone'], meter.props['data-full']])).toEqual([
      ['landed', undefined], ['landed', undefined], ['landed', undefined], ['landed', undefined],
    ]);
    const widths = meters.map((meter) => (tree.onlyWithClass([meter], 'gaia-meter-fill').props['style'] as { readonly width?: string }).width);
    expect(widths.slice(4)).toEqual(['100%', `${(418 / 512) * 100}%`, `${(164 / 512) * 100}%`, `${(146 / 512) * 100}%`]);
  });

  test('the usage line is the forges\' reading, and with no forge reporting today or usage the lists say so and the usage is absent', () => {
    expect(tree.textOf([tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES).unfolded, 'gaia-activity-usage-line')])).toBe('under its limit · window resets 16:00');
    const empty = layoutOf(FLEET_EMPTY).unfolded;
    const sideSentences = tree.hostElementsIn(empty, tree.withClass('gaia-activity-side-empty')).map((sentence) => tree.textOf([sentence]));
    expect(sideSentences).toEqual(['No forge reports it.', 'No forge reports it.']);
    expect(tree.hostElementsIn(empty, tree.withClass('gaia-activity-usage'))).toEqual([]);
  });
});

describe('the view with its filters', () => {
  test('it opens on every entry of every forge, with the menu closed', () => {
    const markup = renderToStaticMarkup(<ActivityView fleetDocument={FLEET_FIVE_FORGES} timeZone={FIXTURE_TIME_ZONE} />);
    expect(markup.match(/<time class="gaia-activity-at"/g)).toHaveLength(16);
    expect(markup).toContain('aria-pressed="true">Everything</button>');
    expect(markup).toContain('aria-pressed="true">All forges</button>');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('class="gaia-activity-forge-menu"');
  });
});
