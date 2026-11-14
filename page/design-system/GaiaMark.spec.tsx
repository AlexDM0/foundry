/**
 * Gaia's mark. What matters: it is the tile of COMPONENT_LIBRARY 3.1, drawn on the 64-unit grid in the order the board draws it (tile, the
 * ring under its mask, core, node ring, node core, rim), every colour a class whose rule reads the mark's tokens, so it follows the theme;
 * it is hidden from the accessibility tree, 28 px by default and at the size asked.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { GaiaMark }         from './GaiaMark.tsx';

const MARK_TOKEN_RULES = [
  ['gaia-mark-ground-from', '--mark-from'],
  ['gaia-mark-ground-to', '--mark-to'],
  ['gaia-mark-ring', '--mark-line'],
  ['gaia-mark-core', '--mark-core'],
  ['gaia-mark-node-ring', '--mark-node-ring'],
  ['gaia-mark-node-core', '--mark-node-core'],
  ['gaia-mark-rim', '--mark-rim'],
] as const;

describe('the mark', () => {
  test('it draws the tile, the masked ring, the core, the node and the rim on the 64-unit grid, hidden, 28 px by default', () => {
    const unfolded = ReactElementTree.unfolded(<GaiaMark />);
    const mark = ReactElementTree.onlyWithTag(unfolded, 'svg');
    expect([mark.props['aria-hidden'], mark.props['viewBox'], mark.props['width'], mark.props['height']]).toEqual(['true', '0 0 64 64', 28, 28]);
    const drawn = ReactElementTree.hostElementsIn(unfolded, (element) => ['rect', 'circle'].includes(element.tag) && element.props['className'] !== undefined);
    expect(drawn.map((element) => element.props['className'])).toEqual([
      'gaia-mark-mask-open', 'gaia-mark-mask-shut', 'gaia-mark-ring', 'gaia-mark-core', 'gaia-mark-node-ring', 'gaia-mark-node-core', 'gaia-mark-rim',
    ]);
    const ring = ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-ring');
    expect([ring.props['r'], ring.props['strokeWidth']]).toEqual(['17.5', '5']);
    const gap = ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-mask-shut');
    expect([gap.props['cx'], gap.props['cy'], gap.props['r']]).toEqual(['44.4', '19.6', '10.4']);
  });

  test('each of its colours is a rule that reads the mark\'s own token', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const [className, token] of MARK_TOKEN_RULES) expect(stylesheetText).toMatch(new RegExp(`\\.${className} \\{[^}]*var\\(${token}\\)`));
  });

  test('it takes the size it is given, as the splash draws it larger', () => {
    const mark = ReactElementTree.onlyWithTag(ReactElementTree.unfolded(<GaiaMark sizePixels={88} />), 'svg');
    expect([mark.props['width'], mark.props['height']]).toEqual([88, 88]);
  });
});
