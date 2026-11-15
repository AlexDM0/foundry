/**
 * Gaia's mark, in a happy-dom document. What matters: below the threshold it is the small drawing and from it on the large one; each is
 * drawn on the 64-unit grid in the order its source draws it, the large one with a halo around each node and a glow on the top left one,
 * the small one with solid nodes, a thicker ring and a larger core; each drawing names its gradient, mask and filter with ids of its own,
 * so two marks on a page never fight; it is hidden from the accessibility tree, 28 px by default and at the size asked.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { GaiaMark, SMALL_DRAWING_BELOW_SIZE_PIXELS } from './GaiaMark.tsx';

const LARGE_SIZE_PIXELS = 88;
const SMALL_SIZE_PIXELS = 16;

afterEach(() => {
  cleanup();
});

function markAt(sizePixels?: number): Element {
  const { container } = render(sizePixels === undefined ? <GaiaMark /> : <GaiaMark sizePixels={sizePixels} />);
  const mark = container.querySelector('svg');
  if (mark === null) throw new Error('The mark drew no svg.');
  return mark;
}

function attributesOf(elements: Iterable<Element>, ...attributeNames: string[]): (string | null)[][] {
  return [...elements].map((element) => attributeNames.map((attributeName) => element.getAttribute(attributeName)));
}

/** The class of every drawn part, the svg and the gradient's stops aside, in document order. */
function drawnClassesOf(mark: Element): (string | null)[] {
  return [...mark.querySelectorAll('[class]')].filter((element) => element.tagName.toLowerCase() !== 'stop').map((element) => element.getAttribute('class'));
}

describe('the gaia mark', () => {
  test('it is hidden from the accessibility tree, on the 64-unit grid, 28 px by default and so the large drawing', () => {
    expect(attributesOf([markAt()], 'class', 'aria-hidden', 'viewBox', 'width', 'height', 'data-drawing')).toEqual([
      ['brand-gaia-mark', 'true', '0 0 64 64', '28', '28', 'large'],
    ]);
  });

  test('it takes the size it is given', () => {
    expect(attributesOf([markAt(LARGE_SIZE_PIXELS)], 'width', 'height')).toEqual([['88', '88']]);
  });

  test('it is the small drawing just below the threshold and the large drawing from the threshold on', () => {
    expect(markAt(SMALL_DRAWING_BELOW_SIZE_PIXELS - 1).getAttribute('data-drawing')).toBe('small');
    expect(markAt(SMALL_DRAWING_BELOW_SIZE_PIXELS).getAttribute('data-drawing')).toBe('large');
  });

  test('the large drawing is the tile, the ring under a mask opened at three nodes, the core, the glow, each node\'s halo and core, and the rim', () => {
    const mark = markAt(LARGE_SIZE_PIXELS);
    expect(drawnClassesOf(mark)).toEqual([
      'brand-gaia-mark-mask-open',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-ring',
      'brand-gaia-mark-core',
      'brand-gaia-mark-glow',
      'brand-gaia-mark-node-halo',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-node-halo',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-node-halo',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-rim',
    ]);
    expect(mark.querySelector('.brand-gaia-mark-ring')?.getAttribute('stroke-width')).toBe('3');
    expect(attributesOf(mark.querySelectorAll('.brand-gaia-mark-node-halo'), 'cx', 'cy', 'r', 'stroke-width', 'fill-opacity')).toEqual([
      ['15.98', '22.75', '6.4', '1.5', '0.22'],
      ['48.02', '41.25', '6.0', '1.25', '0.22'],
      ['23.99', '45.88', '4.4', '1.25', '0.22'],
    ]);
    expect(attributesOf(mark.querySelectorAll('.brand-gaia-mark-glow'), 'cx', 'cy', 'r', 'opacity', 'filter')).toEqual([
      ['15.98', '22.75', '5.5', '0.22', 'url(#brand-gaia-mark-large-glow)'],
    ]);
    expect(attributesOf(mark.querySelectorAll('.brand-gaia-mark-mask-shut'), 'r')).toEqual([['9.00'], ['8.60'], ['6.80']]);
  });

  test('the small drawing is the tile, a thicker ring under a tighter mask, a larger core, three solid nodes and the rim, with no halo and no glow', () => {
    const mark = markAt(SMALL_SIZE_PIXELS);
    expect(drawnClassesOf(mark)).toEqual([
      'brand-gaia-mark-mask-open',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-mask-shut',
      'brand-gaia-mark-ring',
      'brand-gaia-mark-core',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-node-core',
      'brand-gaia-mark-rim',
    ]);
    expect(mark.querySelector('.brand-gaia-mark-ring')?.getAttribute('stroke-width')).toBe('5.8');
    expect(attributesOf(mark.querySelectorAll('.brand-gaia-mark-node-core'), 'r')).toEqual([['5.95'], ['5.60'], ['4.02']]);
    expect(attributesOf(mark.querySelectorAll('.brand-gaia-mark-mask-shut'), 'r')).toEqual([['8.55'], ['8.20'], ['6.62']]);
    const largeCore = markAt(LARGE_SIZE_PIXELS).querySelector('.brand-gaia-mark-core')?.getAttribute('d');
    expect(mark.querySelector('.brand-gaia-mark-core')?.getAttribute('d')).not.toBe(largeCore);
  });

  test('each drawing names its gradient, mask and filter with ids of its own, and points only at them', () => {
    expect(attributesOf(markAt(LARGE_SIZE_PIXELS).querySelectorAll('[id]'), 'id').flat()).toEqual([
      'brand-gaia-mark-large-ground',
      'brand-gaia-mark-large-glow',
      'brand-gaia-mark-large-gap',
    ]);
    expect(attributesOf(markAt(SMALL_SIZE_PIXELS).querySelectorAll('[id]'), 'id').flat()).toEqual(['brand-gaia-mark-small-ground', 'brand-gaia-mark-small-gap']);
    for (const [sizePixels, drawing] of [[LARGE_SIZE_PIXELS, 'large'], [SMALL_SIZE_PIXELS, 'small']] as const) {
      const references = attributesOf(markAt(sizePixels).querySelectorAll('[fill^="url("], [mask], [filter]'), 'fill', 'mask', 'filter')
        .flat()
        .filter((value) => value?.startsWith('url(') === true);
      expect(references.length).toBeGreaterThan(1);
      for (const reference of references) expect(reference).toStartWith(`url(#brand-gaia-mark-${drawing}-`);
    }
  });
});
