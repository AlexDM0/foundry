/**
 * The one shape writer in a happy-dom document: each kind of shape becomes its SVG element, each element is made once per key and then only
 * changed, follows the drawing's order, and is mirrored back when never mirrored.
 */
import { describe, expect, test } from 'bun:test';

import type { Drawing, Shape } from './Shape.ts';
import { createShapeWriter }   from './ShapeWriter.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function writerInGroup(hiddenAs: 'transparent' | 'undisplayed' = 'transparent') {
  const parent = document.createElementNS(SVG_NAMESPACE, 'svg');
  return { parent, writer: createShapeWriter(document, parent, hiddenAs, 'square') };
}

const SQUARE: Shape = {
  kind: 'rectangle', key: 'square', x: 1, y: 2, width: 3, height: 4, cornerRadius: 0.5, fill: 'body',
};
const DOT: Shape = {
  kind: 'circle', key: 'dot', centreX: 5, centreY: -6, radius: 2.2, fill: 'none', stroke: 'graphite', strokeWidth: 0.8, dash: [1, 2.2],
};

describe('each kind of shape', () => {
  test.each([
    [{ kind: 'polygon', key: 'shape', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] }, 'polygon', { points: '0,0 4,0 0,3' }],
    [SQUARE, 'rect', {
      x: '1', y: '2', width: '3', height: '4', rx: '0.5', fill: 'var(--flint-body, #fa5f01)',
    }],
    [{
      kind: 'line', key: 'shape', x1: 0, y1: 1, x2: 2, y2: 3, lineCap: 'round',
    }, 'line', {
      'x1': '0', 'y1': '1', 'x2': '2', 'y2': '3', 'stroke-linecap': 'round',
    }],
    [DOT, 'circle', {
      'cx': '5', 'cy': '-6', 'r': '2.2', 'fill': 'none', 'stroke-dasharray': '1 2.2',
    }],
    [{ kind: 'path', key: 'shape', pathData: 'M0 0 L1 1' }, 'path', { d: 'M0 0 L1 1' }],
    [{
      kind: 'text', key: 'shape', x: 0, y: 5, text: '?', fontFamily: 'system-ui', fontSize: 12, fontWeight: 700,
    }, 'text', {
      'x': '0', 'y': '5', 'text-anchor': 'middle', 'font-size': '12', 'font-weight': '700',
    }],
  ] satisfies readonly (readonly [Shape, string, Record<string, string>])[])('a %o is written as its element', (shape, elementName, attributes) => {
    const { parent, writer } = writerInGroup();
    writer.draw({ shapes: [shape] }, 1);
    const element = parent.querySelector('g')?.firstElementChild;
    expect(element?.tagName.toLowerCase()).toBe(elementName);
    for (const [name, value] of Object.entries(attributes)) expect(element?.getAttribute(name)).toBe(value);
  });

  test('a text shape carries its text', () => {
    const { parent, writer } = writerInGroup();
    writer.draw({
      shapes: [{
        kind: 'text', key: 'mark', x: 0, y: 5, text: 'Hi!', fontFamily: 'system-ui', fontSize: 12, fontWeight: 700,
      }],
    }, 1);
    expect(parent.querySelector('text')?.textContent).toBe('Hi!');
  });
});

describe('the pool of elements', () => {
  test('an element is made once for its key and only changed on the next frame', () => {
    const { parent, writer } = writerInGroup();
    writer.draw({ shapes: [SQUARE] }, 1);
    const first = parent.querySelector('rect');
    writer.draw({ shapes: [{ ...SQUARE, x: 9 }] }, 1);
    expect(parent.querySelector('rect')).toBe(first);
    expect(first?.getAttribute('x')).toBe('9');
  });

  test('the elements follow the order of the drawing, and a shape left out leaves the group to come back as the same element', () => {
    const { parent, writer } = writerInGroup();
    writer.draw({ shapes: [SQUARE, DOT] }, 1);
    const square = parent.querySelector('rect');
    writer.draw({ shapes: [DOT, SQUARE] }, 1);
    expect([...(parent.querySelector('g')?.children ?? [])].map((element) => element.tagName.toLowerCase())).toEqual(['circle', 'rect']);
    writer.draw({ shapes: [DOT] }, 1);
    expect(parent.querySelector('rect')).toBeNull();
    writer.draw({ shapes: [SQUARE, DOT] }, 1);
    expect(parent.querySelector('rect')).toBe(square);
  });

  test('an attribute the shape no longer gives is removed', () => {
    const { parent, writer } = writerInGroup();
    writer.draw({ shapes: [DOT] }, 1);
    writer.draw({ shapes: [{ ...DOT, dash: undefined }].map(({ dash: _dash, ...shape }) => shape as Shape) }, 1);
    expect(parent.querySelector('circle')?.hasAttribute('stroke-dasharray')).toBe(false);
  });
});

describe('the group and the facing', () => {
  test('the drawing\'s opacity and transform are the group\'s', () => {
    const { parent, writer } = writerInGroup();
    const drawing: Drawing = { opacity: 0.5, transform: [{ translateX: 0, translateY: 2.5 }], shapes: [SQUARE] };
    writer.draw(drawing, 1);
    const group = parent.querySelector('g');
    expect([group?.getAttribute('opacity'), group?.getAttribute('transform')]).toEqual(['0.5', 'translate(0 2.5)']);
  });

  test('facing left, a shape that is never mirrored is mirrored back about its own x, before its own transform', () => {
    const { parent, writer } = writerInGroup();
    const tick: Shape = {
      kind: 'path', key: 'tick', pathData: 'M40 -52 l3 3 l6 -7', unmirroredAboutX: 44.5, transform: [{ translateX: 0, translateY: 1 }],
    };
    writer.draw({ shapes: [tick] }, -1);
    expect(parent.querySelector('path')?.getAttribute('transform')).toBe('translate(89 0) scale(-1 1) translate(0 1)');
    writer.draw({ shapes: [tick] }, 1);
    expect(parent.querySelector('path')?.getAttribute('transform')).toBe('translate(0 1)');
  });

  test('a hidden drawing keeps its elements: at opacity 0, or out of the layout', () => {
    const transparent = writerInGroup('transparent');
    transparent.writer.draw({ shapes: [SQUARE] }, 1);
    transparent.writer.draw(null, 1);
    expect([transparent.parent.querySelector('g')?.getAttribute('opacity'), transparent.parent.querySelectorAll('rect').length]).toEqual(['0', 1]);
    const undisplayed = writerInGroup('undisplayed');
    undisplayed.writer.draw({ shapes: [SQUARE] }, 1);
    undisplayed.writer.draw(null, 1);
    expect(undisplayed.parent.querySelector('g')?.getAttribute('display')).toBe('none');
    undisplayed.writer.draw({ shapes: [SQUARE] }, 1);
    expect(undisplayed.parent.querySelector('g')?.getAttribute('display')).toBe('inline');
  });
});

test('the group carries the name of the part it draws', () => {
  const { writer } = writerInGroup();
  expect(writer.element.getAttribute('data-flint-part')).toBe('square');
});
