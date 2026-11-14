/**
 * The rail as markup (SCREENS "The shell"). What matters: it is the navigation landmark named Gaia, with no brand of its own (the brand bar
 * holds it); each row is a link to its route showing the model's label and count in the package's count badge, orange where it waits on
 * User and plain otherwise, its mark after it; the current row, and only it, carries `aria-current`; a forge row leads with its condition
 * dot, hidden from the accessibility tree; with no forge registered the forges' group says "No forge is registered" and the slot meter
 * shows every slot free; and this machine is one link to the Forges view, with its slot meter and its lines.
 */
import { describe, expect, test } from 'bun:test';

import { DrawnDots }                                        from '../testing/DrawnDots.ts';
import { GaiaStylesheet }                                   from '../testing/GaiaStylesheet.ts';
import { type HostElement, ReactElementTree }               from '../testing/ReactElementTree.ts';
import { FLEET_AT_LIMIT }                                   from '../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                   from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                      from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { DEFAULT_ROUTE, type GaiaRoute }                    from './HashRouter.ts';
import { Rail }                                             from './Rail.tsx';
import { RailModel }                                        from './RailModel.ts';

const tree = ReactElementTree;

function slotCellsOf(meter: HostElement): unknown[] {
  return tree.hostElementsIn([meter], tree.withClass('design-system-slot-meter-cell')).map((cell) => cell.props['data-cell']);
}

function unfoldedRail(...railArguments: Parameters<typeof RailModel.railContentOf>) {
  return tree.unfolded(<Rail content={RailModel.railContentOf(...railArguments)} />);
}

describe('the rail', () => {
  test('it is the navigation landmark named Gaia, and leaves the mark to the brand bar', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    expect(tree.onlyWithTag(unfolded, 'nav').props['aria-label']).toBe('Gaia');
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-mark'))).toEqual([]);
  });

  test('each row links to its route with its label and count, a count that waits on User orange and the others plain', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    const rows = tree.hostElementsIn(unfolded, tree.withClass('gaia-rail-row'));
    expect(rows.map((row) => [row.props['href'], tree.textOf([row])])).toEqual([
      ['#attention', 'Attention5'],
      ['#agents', 'Agents10'],
      ['#activity', 'Activity'],
      ['#forges', 'Forges6'],
      [`#forge/${FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront}`, 'Example Storefront2'],
      [`#forge/${FLEET_FIVE_FORGES_TRACKER_IDS.invoiceService}`, 'Invoice Service2'],
      [`#forge/${FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki}`, 'Research Wiki1'],
      [`#forge/${FLEET_FIVE_FORGES_TRACKER_IDS.exampleMobileApp}`, 'Example Mobile App'],
      [`#forges?forge=${FLEET_FIVE_FORGES_TRACKER_IDS.designSystem}`, 'Design System'],
      [`#forges?forge=${FLEET_FIVE_FORGES_TRACKER_IDS.legacyImporter}`, 'Legacy Importer'],
    ]);
    const counts = tree.hostElementsIn(unfolded, tree.withClass('design-system-count-badge'));
    expect(counts.map((count) => [tree.textOf([count]), count.props['data-tone']])).toEqual([
      ['5', 'warn'],
      ['10', 'neutral'],
      ['6', 'neutral'],
      ['2', 'warn'],
      ['2', 'warn'],
      ['1', 'warn'],
    ]);
  });

  test('a count Gaia cannot vouch for carries its mark after the badge: 4+ on Attention, 2? on an unreachable forge, plain', () => {
    const unfolded = unfoldedRail(FLEET_DEGRADED, DEFAULT_ROUTE);
    const isMarked = (count: HostElement) => tree.hostElementsIn([count], tree.withClass('gaia-rail-count-mark')).length > 0;
    const marked = tree.hostElementsIn(unfolded, tree.withClass('gaia-rail-count')).filter(isMarked);
    expect(marked.map((count) => [
      tree.textOf([count]),
      tree.onlyWithClass([count], 'design-system-count-badge').props['data-tone'],
      tree.onlyWithClass([count], 'gaia-rail-count-mark').props['title'],
    ])).toEqual([
      ['4+', 'warn', 'more possible'],
      ['2?', 'neutral', 'as last reported'],
    ]);
  });

  test('only the current row carries aria-current, a view\'s row on its route and a forge\'s row in place', () => {
    const currentRowsAt = (route: GaiaRoute) => tree.hostElementsIn(unfoldedRail(FLEET_FIVE_FORGES, route), (element) => element.props['aria-current'] !== undefined)
      .map((row) => [tree.textOf([row]), row.props['aria-current']]);
    expect(currentRowsAt(DEFAULT_ROUTE)).toEqual([['Attention5', 'page']]);
    expect(currentRowsAt({ view: 'forge', trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki, bridgeFragment: null })).toEqual([['Research Wiki1', 'page']]);
  });

  test('the active row is drawn on the wash with an inset ink edge and in the strong weight, and a hover changes only its colours', () => {
    const stylesheet = GaiaStylesheet.text();
    const activeRowRule = new RegExp([
      String.raw`\.gaia-rail-row\[aria-current="page"\] \{\s*background: var\(--wash\);`,
      String.raw`\s*box-shadow: inset var\(--selected-edge-width\) 0 0 var\(--ink\);\s*color: var\(--ink\);\s*font-weight: var\(--weight-strong\);\s*\}`,
    ].join(''));
    expect(stylesheet).toMatch(activeRowRule);
    expect(stylesheet).toMatch(/\.gaia-rail-row:hover \{ background: var\(--wash\); color: var\(--ink\); \}/);
  });

  test('a forge row leads with its condition dot, hidden from the accessibility tree, in the forges group', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    const dots = tree.hostElementsIn(unfolded, DrawnDots.isDot);
    expect(dots.map(DrawnDots.conditionOf)).toEqual(['live', 'live', 'live', 'held', 'dormant', 'unreadable|missing']);
    expect(dots.every((dot) => dot.props['aria-hidden'] === 'true')).toBe(true);
    const group = tree.onlyHostElementIn(unfolded, (element) => element.props['role'] === 'group');
    expect(tree.onlyWithClass([group], 'design-system-micro-caps').props['id']).toBe(group.props['aria-labelledby']);
  });

  test('this machine is one link to the Forges view with its figure, its slot meter of the limit in orange, and its limit line', () => {
    const machine = tree.onlyWithClass(unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE), 'gaia-rail-machine');
    expect(machine.tag).toBe('a');
    expect(machine.props['href']).toBe('#forges');
    expect(machine.props['data-at-the-limit']).toBeUndefined();
    expect(tree.textOf([tree.onlyWithClass([machine], 'gaia-rail-machine-agents')])).toBe('10 / 12agents');
    const meter = tree.onlyWithClass([machine], 'design-system-slot-meter');
    expect([meter.props['role'], meter.props['aria-label'], meter.props['data-state-tone']]).toEqual(['img', '10 of 12 agents', 'accent']);
    expect(slotCellsOf(meter)).toEqual([...Array<string>(10).fill('filled'), 'empty', 'empty']);
    expect(tree.hostElementsIn([machine], tree.withClass('gaia-rail-machine-at-the-limit'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass([machine], 'gaia-rail-machine-line')])).toBe('limit 12 of 12 CPUs · Flint\'s brain runs outside it');
  });

  test('at the limit the machine link is marked, every slot is filled, and the line of what waits stands over the limit line', () => {
    const atLimit = tree.onlyWithClass(unfoldedRail(FLEET_AT_LIMIT, DEFAULT_ROUTE), 'gaia-rail-machine');
    expect(atLimit.props['data-at-the-limit']).toBe('');
    expect(slotCellsOf(tree.onlyWithClass([atLimit], 'design-system-slot-meter'))).toEqual(Array<string>(10).fill('filled'));
    const lines = tree.hostElementsIn([atLimit], (element) => ['gaia-rail-machine-at-the-limit', 'gaia-rail-machine-line'].some((className) => tree.hasClass(element, className)));
    expect(lines.map((line) => tree.textOf([line]))).toEqual(['at the limit · 3 tickets wait', 'limit 10 of 12 CPUs · Flint\'s brain runs outside it']);
  });

  test('with no forge registered (B4) the forges\' group is headed as ever and says so in one line, with no forge row, and every slot is free', () => {
    const empty = unfoldedRail(FLEET_EMPTY, DEFAULT_ROUTE);
    const group = tree.onlyHostElementIn(empty, (element) => element.props['role'] === 'group');
    expect(tree.onlyWithClass([group], 'design-system-micro-caps').props['id']).toBe(group.props['aria-labelledby']);
    expect(tree.textOf([tree.onlyWithClass([group], 'gaia-rail-no-forge')])).toBe('No forge is registered');
    expect(slotCellsOf(tree.onlyWithClass(empty, 'design-system-slot-meter'))).toEqual(Array<string>(12).fill('empty'));
    expect(tree.textOf([tree.onlyWithClass(empty, 'gaia-rail-machine-line')])).toBe('no limit known · 12 CPUs');
    expect(tree.hostElementsIn([group], tree.withClass('gaia-rail-row'))).toEqual([]);
    expect(tree.hostElementsIn(unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE), tree.withClass('gaia-rail-no-forge'))).toEqual([]);
  });

  test('before the first document there is no forges\' group at all', () => {
    expect(tree.hostElementsIn(unfoldedRail(null, DEFAULT_ROUTE), (element) => element.props['role'] === 'group')).toEqual([]);
  });

  test('before the first document the rail shows its four views without counts and no machine', () => {
    const unfolded = unfoldedRail(null, DEFAULT_ROUTE);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-rail-row')).map((row) => tree.textOf([row]))).toEqual(['Attention', 'Agents', 'Activity', 'Forges']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-rail-machine'))).toEqual([]);
  });
});
