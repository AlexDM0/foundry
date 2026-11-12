/**
 * The flow arrows, in a happy-dom document. What matters: the layer is hidden from assistive technology and sized by its props; each arrow
 * is a group carrying its tone and, only while active, the active mark, with its line and head paths as given; only a solid arrow at rest
 * measures its line as length one, since its draw-in runs along that length while dashes are in pixels; a label renders one line per line
 * break at its place; `still` marks the layer, which stops every movement.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FlowArrows, type FlowArrow } from './FlowArrows.tsx';

afterEach(() => {
  cleanup();
});

const ARROWS: readonly FlowArrow[] = [
  {
    key: 'builder-gates', linePath: 'M 4 0 L 4 7', headPath: 'M 0 7 L 4 11 L 8 7 Z', tone: 'forward', active: false
  },
  {
    key: 'review-train', linePath: 'M 4 0 L 4 23', headPath: 'M 0 23 L 4 27 L 8 23 Z', tone: 'forward', active: true
  },
  {
    key:      'gates-builder',
    linePath: 'M 28 4 L 0 4',
    headPath: 'M 0 0 L 4 4 L 0 8 Z',
    tone:     'rollback',
    active:   false,
    label:    { x: 8, y: 188, text: 'red: builder\nfixes it' },
  },
  {
    key: 'rereview-gates', linePath: 'M 24 4 L 0 4', headPath: 'M 0 0 L 4 4 L 0 8 Z', tone: 'loop', active: false
  },
  {
    key: 'rereview', linePath: 'M 0 0 L 0 9', headPath: 'M 0 9 L 2 11 L 4 9 Z', tone: 'conditional', active: false
  },
  {
    key: 'slot', linePath: 'M 0 0 L 0 12', headPath: 'M 0 12 L 2 14 L 4 12 Z', tone: 'insert', active: false
  },
];

function arrowGroups(): Element[] {
  return [...document.querySelectorAll('.bridge-flow-arrows > .bridge-flow-arrow')];
}

describe('the flow arrows', () => {
  test('the layer is hidden from assistive technology and sized by its props', () => {
    render(<FlowArrows width={1040} height={616} arrows={ARROWS} />);
    const layer = document.querySelector('svg.bridge-flow-arrows');
    expect([
      layer?.getAttribute('aria-hidden'),
      layer?.getAttribute('width'),
      layer?.getAttribute('height'),
      layer?.getAttribute('viewBox'),
      layer?.hasAttribute('data-still'),
    ]).toEqual(['true', '1040', '616', '0 0 1040 616', false]);
  });

  test('each arrow carries its tone and, only while active, the active mark, with its paths as given', () => {
    render(<FlowArrows width={1040} height={616} arrows={ARROWS} />);
    expect(arrowGroups().map((arrow) => [
      arrow.getAttribute('data-tone'),
      arrow.hasAttribute('data-active'),
      arrow.querySelector('.bridge-flow-arrow-line')?.getAttribute('d'),
      arrow.querySelector('.bridge-flow-arrow-head')?.getAttribute('d'),
    ])).toEqual(ARROWS.map((arrow) => [arrow.tone, arrow.active, arrow.linePath, arrow.headPath]));
  });

  test('only a solid arrow at rest measures its line as length one', () => {
    render(<FlowArrows width={1040} height={616} arrows={ARROWS} />);
    expect(arrowGroups().map((arrow) => arrow.querySelector('.bridge-flow-arrow-line')?.getAttribute('pathLength') ?? null))
      .toEqual(['1', null, null, null, null, null]);
  });

  test('a label renders one line per line break at its place, and only where given', () => {
    render(<FlowArrows width={1040} height={616} arrows={ARROWS} />);
    const labels = [...document.querySelectorAll('.bridge-flow-arrow-label')];
    const lines = [...(labels[0]?.querySelectorAll('tspan') ?? [])];
    expect([
      labels.length,
      labels[0]?.getAttribute('x'),
      labels[0]?.getAttribute('y'),
      lines.map((line) => [line.textContent, line.getAttribute('x'), line.getAttribute('dy')]),
    ]).toEqual([1, '8', '188', [['red: builder', '8', '0'], ['fixes it', '8', '16']]]);
  });

  test('still marks the layer, which stops every movement', () => {
    render(<FlowArrows width={400} height={300} arrows={ARROWS} still />);
    expect(document.querySelector('svg.bridge-flow-arrows')?.hasAttribute('data-still')).toBe(true);
  });
});
