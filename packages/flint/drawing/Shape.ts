/**
 * What a prop, a mark or an attendant draws, as data: a short list of shapes of a fixed set of kinds, each with a colour role, a stroke,
 * an opacity, a dash and a transform. `flint/drawing/ShapeWriter.ts` writes them; a drawing never makes an element itself. All values are
 * in sprite units, for Flint facing right.
 */
import type { Point }           from '../SpriteGeometry.ts';
import type { FlintColourRole } from '../constants/Palette.ts';

/** A gradient a drawing declares by its id, which starts with `flint-`. */
export interface GradientPaint {
  readonly gradient: string;
}

export type Paint = FlintColourRole | GradientPaint | 'none';

/** One step of a transform; the steps of a list apply in the order SVG reads them. */
export type TransformStep =
  | { readonly translateX: number; readonly translateY: number }
  | { readonly rotateDegrees: number; readonly aboutX: number; readonly aboutY: number }
  | { readonly rotateDegrees: number }
  | { readonly scaleX: number; readonly scaleY: number };

export interface ShapeStyle {
  /** Names the shape within its drawing: the writer keeps one element for each key. */
  readonly key:               string;
  /** Absent leaves the SVG default, which is black: give `none` to a stroked path. */
  readonly fill?:             Paint;
  readonly stroke?:           Paint;
  readonly strokeWidth?:      number;
  readonly opacity?:          number;
  readonly fillOpacity?:      number;
  readonly strokeOpacity?:    number;
  /** The length of a dash and of the gap after it. */
  readonly dash?:             readonly [number, number];
  readonly lineCap?:          'round' | 'butt' | 'square';
  readonly lineJoin?:         'round' | 'miter' | 'bevel';
  readonly transform?:        readonly TransformStep[];
  /** A shape that is never mirrored, as a tick or text: facing left, it is mirrored back about this x of its own. */
  readonly unmirroredAboutX?: number;
}

export type Shape =
  | ShapeStyle & { readonly kind: 'polygon'; readonly points: readonly Point[] }
  | ShapeStyle & { readonly kind: 'rectangle'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly cornerRadius?: number }
  | ShapeStyle & { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | ShapeStyle & { readonly kind: 'circle'; readonly centreX: number; readonly centreY: number; readonly radius: number }
  | ShapeStyle & { readonly kind: 'path'; readonly pathData: string }
  | ShapeStyle & {
    readonly kind:       'text';
    readonly x:          number;
    readonly y:          number;
    readonly text:       string;
    readonly fontFamily: string;
    readonly fontSize:   number;
    readonly fontWeight: number;
  };

export type ShapeKind = Shape['kind'];

/** One drawing: its shapes in their order, back to front, under one opacity and one transform. */
export interface Drawing {
  readonly opacity?:   number;
  readonly transform?: readonly TransformStep[];
  readonly shapes:     readonly Shape[];
}

/** A horizontal linear gradient, from x 0 to x 1 of the shape it fills. */
export interface GradientDefinition {
  readonly id:    string;
  readonly stops: readonly { readonly offset: number; readonly colour: FlintColourRole }[];
}
