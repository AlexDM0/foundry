/**
 * The arrows of a flow, one SVG layer over its nodes, hidden from assistive technology: the nodes carry the meaning. Each arrow is a line
 * path and a filled head path, toned by what it means; an active one runs its dashes along the line, and a solid one draws itself in when
 * it appears. `still` stops every movement. The paths arrive computed, in the layer's own pixels.
 */
export type FlowArrowTone = 'forward' | 'rollback' | 'loop' | 'conditional' | 'insert';

export interface FlowArrowLabel {
  readonly x:    number;
  readonly y:    number;
  /** One line, or several parted by line breaks. */
  readonly text: string;
}

export interface FlowArrow {
  readonly key:      string;
  readonly linePath: string;
  readonly headPath: string;
  readonly tone:     FlowArrowTone;
  readonly active:   boolean;
  readonly label?:   FlowArrowLabel;
}

export interface FlowArrowsProps {
  readonly width:  number;
  readonly height: number;
  readonly arrows: readonly FlowArrow[];
  readonly still?: boolean;
}

const LABEL_LINE_HEIGHT_PIXELS = 16;

/** A solid arrow at rest draws itself in along a path length of one; a dashed or running one cannot, its dashes are in pixels. */
function drawsIn(arrow: FlowArrow): boolean {
  return arrow.tone === 'forward' && !arrow.active;
}

function ArrowLabel({ x, y, text }: FlowArrowLabel) {
  const lines = text.split('\n');
  return (
    <text className="bridge-flow-arrow-label" x={x} y={y}>
      {lines.map((line, i) => (
        // A line of a label has no identity beyond its place in the label.
        <tspan key={i} x={x} dy={i === 0 ? 0 : LABEL_LINE_HEIGHT_PIXELS}>{line}</tspan>
      ))}
    </text>
  );
}

export function FlowArrows({
  width, height, arrows, still = false
}: FlowArrowsProps) {
  return (
    <svg
      className="bridge-flow-arrows"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      data-still={still ? '' : undefined}
    >
      {arrows.map((arrow) => (
        <g key={arrow.key} className="bridge-flow-arrow" data-tone={arrow.tone} data-active={arrow.active ? '' : undefined}>
          <path className="bridge-flow-arrow-line" d={arrow.linePath} pathLength={drawsIn(arrow) ? 1 : undefined} />
          <path className="bridge-flow-arrow-head" d={arrow.headPath} />
          {arrow.label === undefined ? null : <ArrowLabel {...arrow.label} />}
        </g>
      ))}
    </svg>
  );
}
