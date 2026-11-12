/**
 * The geometry of the pipeline flow's arrows. DOM-free: the measured node boxes and the edges in, SVG paths out. A forward edge runs down
 * its column, or crosses to the other column at the side; a rollback leaves by the outer side of its column and a loop by the inner side,
 * each up a lane beside the nodes and into the side of its target. Heads are separate filled paths.
 */

/** `spine` the left column, `branch` the right one, `train` the merge train's frame under the spine. */
export type FlowColumn = 'spine' | 'branch' | 'train';

/** A node's box relative to the flow's canvas, in unscaled pixels. */
export interface FlowLayoutBox {
  readonly nodeId: string;
  readonly column: FlowColumn;
  readonly left:   number;
  readonly top:    number;
  readonly width:  number;
  readonly height: number;
}

export type FlowLayoutTone = 'forward' | 'rollback' | 'loop';

export interface FlowLayoutEdge {
  readonly edgeId:    string;
  readonly from:      string;
  readonly to:        string;
  readonly tone:      FlowLayoutTone;
  readonly active:    boolean;
  /** One line, or several parted by line breaks; null draws no label. */
  readonly labelText: string | null;
}

export interface FlowArrowPlacement {
  readonly key:      string;
  readonly linePath: string;
  readonly headPath: string;
  readonly tone:     FlowLayoutTone;
  readonly active:   boolean;
  readonly label?:   { readonly x: number; readonly y: number; readonly text: string };
}

export interface FlowLayerSize {
  readonly width:  number;
  readonly height: number;
}

const ARROWHEAD_LENGTH_PIXELS = 8;
const ARROWHEAD_HALF_WIDTH_PIXELS = 4;
const ARROWHEAD_TIP_GAP_PIXELS = 1;
const CROSSING_STUB_PIXELS = 36;
const ROLLBACK_LANE_OFFSET_PIXELS = 28;
const LOOP_LANE_OFFSET_PIXELS = 20;
const LABEL_GAP_PIXELS = 8;
/** The room a label takes left of its lane; the designs wrap these labels at about this width. */
const LABEL_ROOM_PIXELS = 92;
/** Room right of the right column for its rollback lane and labels. */
const LAYER_RIGHT_ROOM_PIXELS = 120;
const LAYER_BOTTOM_ROOM_PIXELS = 16;
/** Two centres closer than this run one straight line. */
const STRAIGHT_LINE_TOLERANCE_PIXELS = 0.5;

const COORDINATE_STEPS_PER_PIXEL = 10;

function coordinate(value: number): string {
  return String(Math.round(value * COORDINATE_STEPS_PER_PIXEL) / COORDINATE_STEPS_PER_PIXEL);
}

function polylineOf(points: readonly (readonly [number, number])[]): string {
  return points.map(([horizontal, vertical], i) => `${i === 0 ? 'M' : 'L'} ${coordinate(horizontal)} ${coordinate(vertical)}`).join(' ');
}

function centerXOf(box: FlowLayoutBox): number {
  return box.left + box.width / 2;
}

function centerYOf(box: FlowLayoutBox): number {
  return box.top + box.height / 2;
}

function bottomOf(box: FlowLayoutBox): number {
  return box.top + box.height;
}

function rightOf(box: FlowLayoutBox): number {
  return box.left + box.width;
}

/** The spine and the train stand on the left, the branch on the right. */
function standsOnTheRight(box: FlowLayoutBox): boolean {
  return box.column === 'branch';
}

function downwardHeadOf(tipX: number, tipY: number): string {
  const baseY = tipY - ARROWHEAD_LENGTH_PIXELS;
  return `${polylineOf([[tipX, tipY], [tipX - ARROWHEAD_HALF_WIDTH_PIXELS, baseY], [tipX + ARROWHEAD_HALF_WIDTH_PIXELS, baseY]])} Z`;
}

/** `direction` +1 points right, -1 points left. */
function sidewaysHeadOf(tipX: number, tipY: number, direction: number): string {
  const baseX = tipX - direction * ARROWHEAD_LENGTH_PIXELS;
  return `${polylineOf([[tipX, tipY], [baseX, tipY - ARROWHEAD_HALF_WIDTH_PIXELS], [baseX, tipY + ARROWHEAD_HALF_WIDTH_PIXELS]])} Z`;
}

/** Down the column into the target's top; a step aside halfway when the two centres differ, as into the train's frame. */
function downTheColumn(source: FlowLayoutBox, target: FlowLayoutBox): Pick<FlowArrowPlacement, 'linePath' | 'headPath'> {
  const startX = centerXOf(source);
  const startY = bottomOf(source);
  const endX = centerXOf(target);
  const tipY = target.top - ARROWHEAD_TIP_GAP_PIXELS;
  const baseY = tipY - ARROWHEAD_LENGTH_PIXELS;
  const points: [number, number][] = Math.abs(startX - endX) < STRAIGHT_LINE_TOLERANCE_PIXELS
    ? [[startX, startY], [startX, baseY]]
    : [[startX, startY], [startX, (startY + target.top) / 2], [endX, (startY + target.top) / 2], [endX, baseY]];
  return { linePath: polylineOf(points), headPath: downwardHeadOf(endX, tipY) };
}

/**
 * Across to the other column, into the target's near side: straight down and across to a target wholly below the source, otherwise out of
 * the source's side, up or down a lane just beside it, and across.
 */
function acrossTheColumns(source: FlowLayoutBox, target: FlowLayoutBox, labelText: string | null): Omit<FlowArrowPlacement, 'key' | 'tone' | 'active'> {
  const direction = centerXOf(target) > centerXOf(source) ? 1 : -1;
  const tipX = direction === 1 ? target.left - ARROWHEAD_TIP_GAP_PIXELS : rightOf(target) + ARROWHEAD_TIP_GAP_PIXELS;
  const baseX = tipX - direction * ARROWHEAD_LENGTH_PIXELS;
  const endY = centerYOf(target);
  const headPath = sidewaysHeadOf(tipX, endY, direction);
  if (target.top >= bottomOf(source)) {
    const startX = centerXOf(source);
    return { linePath: polylineOf([[startX, bottomOf(source)], [startX, endY], [baseX, endY]]), headPath };
  }
  const startX = direction === 1 ? rightOf(source) : source.left;
  const startY = centerYOf(source);
  const laneX = startX + direction * CROSSING_STUB_PIXELS;
  return {
    linePath: polylineOf([[startX, startY], [laneX, startY], [laneX, endY], [baseX, endY]]),
    headPath,
    ...(labelText === null ? {} : { label: { x: laneX + LABEL_GAP_PIXELS, y: endY - LABEL_GAP_PIXELS, text: labelText } }),
  };
}

/** Back up the column by a lane on one side: `outer` is the canvas edge's side of the column, `inner` the side facing the other column. */
function backUpTheColumn(
  source: FlowLayoutBox,
  target: FlowLayoutBox,
  side: 'outer' | 'inner',
  labelText: string | null,
): Omit<FlowArrowPlacement, 'key' | 'tone' | 'active'> {
  const onTheLeft = standsOnTheRight(source) === (side === 'inner');
  const laneOffset = side === 'outer' ? ROLLBACK_LANE_OFFSET_PIXELS : LOOP_LANE_OFFSET_PIXELS;
  const startY = centerYOf(source);
  const endY = centerYOf(target);
  const labelY = (startY + endY) / 2;
  if (onTheLeft) {
    const laneX = Math.min(source.left, target.left) - laneOffset;
    const tipX = target.left - ARROWHEAD_TIP_GAP_PIXELS;
    return {
      linePath: polylineOf([[source.left, startY], [laneX, startY], [laneX, endY], [tipX - ARROWHEAD_LENGTH_PIXELS, endY]]),
      headPath: sidewaysHeadOf(tipX, endY, 1),
      ...(labelText === null ? {} : { label: { x: Math.max(0, laneX - LABEL_ROOM_PIXELS), y: labelY, text: labelText } }),
    };
  }
  const laneX = Math.max(rightOf(source), rightOf(target)) + laneOffset;
  const tipX = rightOf(target) + ARROWHEAD_TIP_GAP_PIXELS;
  return {
    linePath: polylineOf([[rightOf(source), startY], [laneX, startY], [laneX, endY], [tipX + ARROWHEAD_LENGTH_PIXELS, endY]]),
    headPath: sidewaysHeadOf(tipX, endY, -1),
    ...(labelText === null ? {} : { label: { x: laneX + LABEL_GAP_PIXELS, y: labelY, text: labelText } }),
  };
}

function arrowOf(edge: FlowLayoutEdge, source: FlowLayoutBox, target: FlowLayoutBox): FlowArrowPlacement {
  const placement = { key: edge.edgeId, tone: edge.tone, active: edge.active };
  if (edge.tone === 'rollback') return { ...placement, ...backUpTheColumn(source, target, 'outer', edge.labelText) };
  if (edge.tone === 'loop') return { ...placement, ...backUpTheColumn(source, target, 'inner', edge.labelText) };
  if (standsOnTheRight(source) !== standsOnTheRight(target)) return { ...placement, ...acrossTheColumns(source, target, edge.labelText) };
  return { ...placement, ...downTheColumn(source, target) };
}

/** One arrow per edge whose two nodes were measured, in the edges' order. */
function arrowsOf(edges: readonly FlowLayoutEdge[], boxes: readonly FlowLayoutBox[]): FlowArrowPlacement[] {
  const boxById = new Map(boxes.map((box) => [box.nodeId, box]));
  return edges.flatMap((edge) => {
    const source = boxById.get(edge.from);
    const target = boxById.get(edge.to);
    return source === undefined || target === undefined ? [] : [arrowOf(edge, source, target)];
  });
}

/** The arrow layer covers every box, with room right of them for the right column's lane and labels. */
function layerSizeOf(boxes: readonly FlowLayoutBox[]): FlowLayerSize {
  if (boxes.length === 0) return { width: 0, height: 0 };
  return {
    width:  Math.max(...boxes.map(rightOf)) + LAYER_RIGHT_ROOM_PIXELS,
    height: Math.max(...boxes.map(bottomOf)) + LAYER_BOTTOM_ROOM_PIXELS,
  };
}

export const PipelineFlowLayoutUtil = Object.freeze({ arrowsOf, layerSizeOf });
