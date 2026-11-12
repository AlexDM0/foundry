/**
 * The flow's arrow geometry as exact paths for one fixed set of boxes, the drawn flow's left spine, right column and merge train. What
 * matters: a forward arrow runs down its column into the next node's top, or steps aside into the train's frame; the "all green" arrow
 * leaves the merge before review by its side and enters Review from the left; an arrow into the train comes down and across; a rollback
 * leaves by the outer side of its column, a loop by the inner side; a head is its own filled path one pixel off the box; an edge with an
 * unmeasured node draws nothing.
 */
import { describe, expect, test } from 'bun:test';

import type { FlowColumn, FlowLayoutBox, FlowLayoutEdge } from './PipelineFlowLayoutUtil.ts';
import { PipelineFlowLayoutUtil }                         from './PipelineFlowLayoutUtil.ts';

const { arrowsOf, layerSizeOf } = PipelineFlowLayoutUtil;

function box(nodeId: string, column: FlowColumn, left: number, top: number, height = 56): FlowLayoutBox {
  return {
    nodeId, column, left, top, width: 304, height
  };
}

const BOXES: readonly FlowLayoutBox[] = [
  box('builder', 'spine', 128, 100),
  box('gates-build', 'spine', 128, 180),
  box('merge-before-review', 'spine', 128, 260, 72),
  box('review', 'branch', 592, 16),
  box('gates-review', 'branch', 592, 96),
  box('re-review', 'branch', 592, 176, 48),
  box('ready-for-airlock', 'branch', 592, 248, 48),
  box('merge-in-airlock', 'train', 128, 400, 48),
];

function edge(from: string, to: string, changes: Partial<FlowLayoutEdge> = {}): FlowLayoutEdge {
  return {
    edgeId: `${from}->${to}`, from, to, tone: 'forward', active: false, labelText: null, ...changes
  };
}

function onlyArrowOf(layoutEdge: FlowLayoutEdge, boxes: readonly FlowLayoutBox[] = BOXES) {
  const [arrow] = arrowsOf([layoutEdge], boxes);
  if (arrow === undefined) throw new Error('no arrow');
  return arrow;
}

describe('arrowsOf', () => {
  test('a forward edge in one column runs down from the bottom centre to a head on the next top', () => {
    const arrow = onlyArrowOf(edge('builder', 'gates-build', { active: true }));
    expect(arrow).toEqual({
      key: 'builder->gates-build', tone: 'forward', active: true, linePath: 'M 280 156 L 280 171', headPath: 'M 280 179 L 276 171 L 284 171 Z',
    });
  });

  test('a forward edge into a box whose centre stands aside steps across halfway down', () => {
    const train = box('merge-in-airlock', 'train', 145, 300, 48);
    const arrow = onlyArrowOf(edge('gates-build', 'merge-in-airlock'), [...BOXES.filter((each) => each.nodeId !== 'merge-in-airlock'), train]);
    expect(arrow.linePath).toBe('M 280 236 L 280 268 L 297 268 L 297 291');
    expect(arrow.headPath).toBe('M 297 299 L 293 291 L 301 291 Z');
  });

  test('the cross arrow leaves the merge before review by its right side, rises in a lane and enters Review from the left, labelled', () => {
    const arrow = onlyArrowOf(edge('merge-before-review', 'review', { labelText: 'all green' }));
    expect(arrow.linePath).toBe('M 432 296 L 468 296 L 468 44 L 583 44');
    expect(arrow.headPath).toBe('M 591 44 L 583 40 L 583 48 Z');
    expect(arrow.label).toEqual({ x: 476, y: 36, text: 'all green' });
  });

  test('an arrow into the train from the right column comes down from the bottom centre and across into the right side', () => {
    const arrow = onlyArrowOf(edge('ready-for-airlock', 'merge-in-airlock'));
    expect(arrow.linePath).toBe('M 744 296 L 744 424 L 441 424');
    expect(arrow.headPath).toBe('M 433 424 L 441 420 L 441 428 Z');
    expect(arrow.label).toBeUndefined();
  });

  test('a rollback in the left column leaves by the left side and its label stands left of the lane', () => {
    const arrow = onlyArrowOf(edge('gates-build', 'builder', { tone: 'rollback', labelText: 'red: builder\nfixes it' }));
    expect(arrow.linePath).toBe('M 128 208 L 100 208 L 100 128 L 119 128');
    expect(arrow.headPath).toBe('M 127 128 L 119 124 L 119 132 Z');
    expect(arrow.label).toEqual({ x: 8, y: 168, text: 'red: builder\nfixes it' });
  });

  test('a rollback in the right column leaves by the right side, its label right of the lane', () => {
    const arrow = onlyArrowOf(edge('gates-review', 'review', { tone: 'rollback', labelText: 'red: reviewer\nfixes it' }));
    expect(arrow.linePath).toBe('M 896 124 L 924 124 L 924 44 L 905 44');
    expect(arrow.headPath).toBe('M 897 44 L 905 40 L 905 48 Z');
    expect(arrow.label).toEqual({ x: 932, y: 84, text: 'red: reviewer\nfixes it' });
  });

  test('a loop in the right column leaves by the inner side, toward the spine', () => {
    const arrow = onlyArrowOf(edge('re-review', 'gates-review', { tone: 'loop', labelText: 'after a re-review:\ngates again' }));
    expect(arrow.tone).toBe('loop');
    expect(arrow.linePath).toBe('M 592 200 L 572 200 L 572 124 L 583 124');
    expect(arrow.headPath).toBe('M 591 124 L 583 120 L 583 128 Z');
    expect(arrow.label).toEqual({ x: 480, y: 162, text: 'after a re-review:\ngates again' });
  });

  test('an edge whose node was not measured draws nothing, and the others keep their order', () => {
    const arrows = arrowsOf([edge('builder', 'gates-build'), edge('builder', 'nowhere'), edge('gates-build', 'builder', { tone: 'rollback' })], BOXES);
    expect(arrows.map((arrow) => arrow.key)).toEqual(['builder->gates-build', 'gates-build->builder']);
  });
});

describe('layerSizeOf', () => {
  test('covers every box with room right of the right column', () => {
    expect(layerSizeOf(BOXES)).toEqual({ width: 1016, height: 464 });
  });

  test('no boxes give an empty layer', () => {
    expect(layerSizeOf([])).toEqual({ width: 0, height: 0 });
  });
});
