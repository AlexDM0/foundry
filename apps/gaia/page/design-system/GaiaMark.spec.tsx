/**
 * Gaia's mark, the constellation. What matters: below the threshold it is the small drawing and from it on the large one; each is drawn on
 * the 64-unit grid in the order its source draws it, the large one with a halo around each node and a glow on the top left one, the small
 * one with solid nodes, a thicker ring and a larger core; each drawing names its gradient, mask and filter with ids of its own, so two marks
 * on a page never fight; every colour is a class whose rule reads the mark's own token, so it follows the theme; it is hidden from the
 * accessibility tree, 28 px by default and at the size asked.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }                            from '../testing/GaiaStylesheet.ts';
import { type HostElement, ReactElementTree }        from '../testing/ReactElementTree.ts';
import { GaiaMark, SMALL_DRAWING_BELOW_SIZE_PIXELS } from './GaiaMark.tsx';

const MARK_TOKEN_RULES = [
  ['gaia-mark-ground-from', '--mark-from'],
  ['gaia-mark-ground-to', '--mark-to'],
  ['gaia-mark-ring', '--mark-ring'],
  ['gaia-mark-core', '--mark-core'],
  ['gaia-mark-node-halo', '--mark-node-halo'],
  ['gaia-mark-node-core', '--mark-core'],
  ['gaia-mark-glow', '--mark-glow'],
  ['gaia-mark-rim', '--mark-rim'],
] as const;

const LARGE_SIZE_PIXELS = 88;
const SMALL_SIZE_PIXELS = 16;
const WINDOW_BAR_SIZE_PIXELS = 22;
const BRAND_BAR_SIZE_PIXELS = 28;

function drawnClassesOf(sizePixels: number): string[] {
  const unfolded = ReactElementTree.unfolded(<GaiaMark sizePixels={sizePixels} />);
  return ReactElementTree.hostElementsIn(unfolded, (element) => typeof element.props['className'] === 'string' && !['svg', 'stop'].includes(element.tag))
    .map((element) => String(element.props['className']));
}

function idsOf(sizePixels: number): string[] {
  const unfolded = ReactElementTree.unfolded(<GaiaMark sizePixels={sizePixels} />);
  return ReactElementTree.hostElementsIn(unfolded, (element) => typeof element.props['id'] === 'string').map((element) => String(element.props['id']));
}

function onlyMarkAt(sizePixels: number): HostElement {
  return ReactElementTree.onlyWithTag(ReactElementTree.unfolded(<GaiaMark sizePixels={sizePixels} />), 'svg');
}

describe('the mark', () => {
  test('it is hidden from the accessibility tree, on the 64-unit grid, 28 px by default and so the large drawing', () => {
    const mark = ReactElementTree.onlyWithTag(ReactElementTree.unfolded(<GaiaMark />), 'svg');
    expect([mark.props['aria-hidden'], mark.props['viewBox'], mark.props['width'], mark.props['height'], mark.props['data-drawing']]).toEqual([
      'true', '0 0 64 64', 28, 28, 'large',
    ]);
  });

  test('it takes the size it is given, as the splash draws it larger', () => {
    const mark = onlyMarkAt(LARGE_SIZE_PIXELS);
    expect([mark.props['width'], mark.props['height']]).toEqual([LARGE_SIZE_PIXELS, LARGE_SIZE_PIXELS]);
  });

  test('it is the small drawing just below the threshold and the large drawing from the threshold on', () => {
    expect(onlyMarkAt(SMALL_DRAWING_BELOW_SIZE_PIXELS - 1).props['data-drawing']).toBe('small');
    expect(onlyMarkAt(SMALL_DRAWING_BELOW_SIZE_PIXELS).props['data-drawing']).toBe('large');
  });

  test('the window bar\'s mark is the small drawing and the brand bar\'s the large one', () => {
    expect([onlyMarkAt(WINDOW_BAR_SIZE_PIXELS).props['data-drawing'], onlyMarkAt(BRAND_BAR_SIZE_PIXELS).props['data-drawing']]).toEqual(['small', 'large']);
  });

  test('the large drawing is the tile, the ring under a mask opened at three nodes, the core, the glow, each node\'s halo and core, and the rim', () => {
    expect(drawnClassesOf(LARGE_SIZE_PIXELS)).toEqual([
      'gaia-mark-mask-open',
      'gaia-mark-mask-shut',
      'gaia-mark-mask-shut',
      'gaia-mark-mask-shut',
      'gaia-mark-ring',
      'gaia-mark-core',
      'gaia-mark-glow',
      'gaia-mark-node-halo',
      'gaia-mark-node-core',
      'gaia-mark-node-halo',
      'gaia-mark-node-core',
      'gaia-mark-node-halo',
      'gaia-mark-node-core',
      'gaia-mark-rim',
    ]);
    const unfolded = ReactElementTree.unfolded(<GaiaMark sizePixels={LARGE_SIZE_PIXELS} />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-ring').props['strokeWidth']).toBe('3');
    const halos = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-mark-node-halo'));
    expect(halos.map((halo) => [halo.props['cx'], halo.props['cy'], halo.props['r'], halo.props['strokeWidth'], halo.props['fillOpacity']])).toEqual([
      ['15.98', '22.75', '6.4', '1.5', '0.22'],
      ['48.02', '41.25', '6.0', '1.25', '0.22'],
      ['23.99', '45.88', '4.4', '1.25', '0.22'],
    ]);
    const glow = ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-glow');
    expect([glow.props['cx'], glow.props['cy'], glow.props['r'], glow.props['opacity']]).toEqual(['15.98', '22.75', '5.5', '0.22']);
    expect(glow.props['filter']).toBe('url(#gaia-mark-large-glow)');
    const gaps = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-mark-mask-shut'));
    expect(gaps.map((gap) => gap.props['r'])).toEqual(['9.00', '8.60', '6.80']);
  });

  test('the small drawing is the tile, a thicker ring under a tighter mask, a larger core, three solid nodes and the rim, with no halo and no glow', () => {
    expect(drawnClassesOf(SMALL_SIZE_PIXELS)).toEqual([
      'gaia-mark-mask-open',
      'gaia-mark-mask-shut',
      'gaia-mark-mask-shut',
      'gaia-mark-mask-shut',
      'gaia-mark-ring',
      'gaia-mark-core',
      'gaia-mark-node-core',
      'gaia-mark-node-core',
      'gaia-mark-node-core',
      'gaia-mark-rim',
    ]);
    const unfolded = ReactElementTree.unfolded(<GaiaMark sizePixels={SMALL_SIZE_PIXELS} />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-ring').props['strokeWidth']).toBe('5.8');
    const nodes = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-mark-node-core'));
    expect(nodes.map((node) => node.props['r'])).toEqual(['5.95', '5.60', '4.02']);
    const gaps = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-mark-mask-shut'));
    expect(gaps.map((gap) => gap.props['r'])).toEqual(['8.55', '8.20', '6.62']);
    const largeCore = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<GaiaMark sizePixels={LARGE_SIZE_PIXELS} />), 'gaia-mark-core');
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-core').props['d']).not.toBe(largeCore.props['d']);
  });

  test('each drawing names its gradient, mask and filter with ids of its own, and points at them', () => {
    expect(idsOf(LARGE_SIZE_PIXELS)).toEqual(['gaia-mark-large-ground', 'gaia-mark-large-glow', 'gaia-mark-large-gap']);
    expect(idsOf(SMALL_SIZE_PIXELS)).toEqual(['gaia-mark-small-ground', 'gaia-mark-small-gap']);
    for (const [sizePixels, drawing] of [[LARGE_SIZE_PIXELS, 'large'], [SMALL_SIZE_PIXELS, 'small']] as const) {
      const unfolded = ReactElementTree.unfolded(<GaiaMark sizePixels={sizePixels} />);
      const references = ReactElementTree.hostElementsIn(unfolded, (element) => ['fill', 'mask', 'filter'].some((name) => String(element.props[name]).startsWith('url(')));
      expect(references.length).toBeGreaterThan(1);
      for (const element of references) {
        const pointed = ['fill', 'mask', 'filter'].map((name) => String(element.props[name])).filter((value) => value.startsWith('url('));
        for (const reference of pointed) expect(reference).toStartWith(`url(#gaia-mark-${drawing}-`);
      }
    }
  });

  test('each of its colours is a rule that reads the mark\'s own token', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const [className, token] of MARK_TOKEN_RULES) expect(stylesheetText).toMatch(new RegExp(`\\.${className} \\{[^}]*var\\(${token}\\)`));
  });
});
