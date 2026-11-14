/**
 * The rail as markup. What matters: it is the navigation landmark named Gaia; each row is a link to its route showing the model's label
 * and count, in the count's tone; the current row carries `aria-current`; a forge row leads with its condition dot, hidden from the
 * accessibility tree; with no forge registered the forges' group says so in one line; and this machine is one link to the Forges view, with
 * a meter only when its limit is known.
 */
import { describe, expect, test } from 'bun:test';

import { DrawnDots }                                        from '../testing/DrawnDots.ts';
import { ReactElementTree }                                 from '../testing/ReactElementTree.ts';
import { FLEET_AT_LIMIT }                                   from '../testing/fixtures/fleet-at-limit.ts';
import { FLEET_EMPTY }                                      from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { DEFAULT_ROUTE }                                    from './HashRouter.ts';
import { Rail }                                             from './Rail.tsx';
import { RailModel }                                        from './RailModel.ts';

const tree = ReactElementTree;

function unfoldedRail(...railArguments: Parameters<typeof RailModel.railContentOf>) {
  return tree.unfolded(<Rail content={RailModel.railContentOf(...railArguments)} />);
}

describe('the rail', () => {
  test('it is the navigation landmark named Gaia, headed by the mark and the name', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    expect(tree.onlyWithTag(unfolded, 'nav').props['aria-label']).toBe('Gaia');
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-rail-brand')])).toBe('Gaia');
    expect(tree.onlyWithClass(unfolded, 'gaia-mark').props['aria-hidden']).toBe('true');
  });

  test('each row links to its route with its label and count, Attention\'s in the attention tone', () => {
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
    const counts = tree.hostElementsIn(unfolded, tree.withClass('gaia-rail-count'));
    expect(counts.map((count) => [tree.textOf([count]), count.props['data-tone']])).toEqual([
      ['5', 'attention'],
      ['10', 'muted'],
      ['6', 'muted'],
      ['2', 'attention'],
      ['2', 'attention'],
      ['1', 'attention'],
    ]);
  });

  test('only the current row carries aria-current', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, { view: 'forge', trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki, bridgeFragment: null });
    const current = tree.hostElementsIn(unfolded, (element) => element.props['aria-current'] !== undefined);
    expect(current.map((row) => [tree.textOf([row]), row.props['aria-current']])).toEqual([['Research Wiki1', 'page']]);
  });

  test('a forge row leads with its condition dot, hidden from the accessibility tree, in the forges group', () => {
    const unfolded = unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    const dots = tree.hostElementsIn(unfolded, DrawnDots.isDot);
    expect(dots.map(DrawnDots.conditionOf)).toEqual(['live', 'live', 'live', 'held', 'dormant', 'unreadable|missing']);
    expect(dots.every((dot) => dot.props['aria-hidden'] === 'true')).toBe(true);
    const group = tree.onlyHostElementIn(unfolded, (element) => element.props['role'] === 'group');
    expect(tree.onlyWithClass([group], 'design-system-micro-caps').props['id']).toBe(group.props['aria-labelledby']);
  });

  test('this machine is one link to the Forges view with its figure, meter and limit line', () => {
    const machine = tree.onlyWithClass(unfoldedRail(FLEET_FIVE_FORGES, DEFAULT_ROUTE), 'gaia-rail-machine');
    expect(machine.tag).toBe('a');
    expect(machine.props['href']).toBe('#forges');
    expect(machine.props['data-at-the-limit']).toBeUndefined();
    expect(tree.textOf([tree.onlyWithClass([machine], 'gaia-rail-machine-agents')])).toBe('10 / 12agents');
    const meter = tree.onlyWithClass([machine], 'design-system-fill-meter');
    expect([meter.props['role'], meter.props['aria-label'], meter.props['data-near']]).toEqual(['img', '10 of 12 agents', undefined]);
    expect(tree.textOf([tree.onlyWithClass([machine], 'gaia-rail-machine-line')])).toBe('limit 12 of 12 CPUs');
  });

  test('at the limit the machine link is marked and its meter is near its limit; with no known limit there is no meter', () => {
    const atLimit = tree.onlyWithClass(unfoldedRail(FLEET_AT_LIMIT, DEFAULT_ROUTE), 'gaia-rail-machine');
    expect(atLimit.props['data-at-the-limit']).toBe('');
    expect(tree.onlyWithClass([atLimit], 'design-system-fill-meter').props['data-near']).toBe('');
    const empty = unfoldedRail(FLEET_EMPTY, DEFAULT_ROUTE);
    expect(tree.hostElementsIn(empty, tree.withClass('design-system-fill-meter'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(empty, 'gaia-rail-machine-line')])).toBe('no limit known · 12 CPUs');
  });

  test('with no forge registered (B4) the forges\' group is headed as ever and says so in one line, with no forge row', () => {
    const empty = unfoldedRail(FLEET_EMPTY, DEFAULT_ROUTE);
    const group = tree.onlyHostElementIn(empty, (element) => element.props['role'] === 'group');
    expect(tree.onlyWithClass([group], 'design-system-micro-caps').props['id']).toBe(group.props['aria-labelledby']);
    expect(tree.textOf([tree.onlyWithClass([group], 'gaia-rail-no-forge')])).toBe('No forge is registered.');
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
