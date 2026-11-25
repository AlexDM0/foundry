/**
 * The extent of everything a drawn pose shows, computed from the pose with no browser: the same layers, transforms and shapes the renderer
 * writes, each shape's box (its stroke's half width included) carried through its transforms by its corners, as a browser's bounding box
 * would be. A shape, a prop or a mark below the visible opacity counts as not drawn. The extent is in sprite units from Flint's bottom tip
 * on its floor, for the facing the pose has, folded so the front is the side Flint faces.
 */
import type { DrawnExtent, Facing, Point }     from '../SpriteGeometry.ts';
import type { HandPose, Pose }                 from '../SpritePose.ts';
import { ATTENDANT_CATALOG }                   from '../attendants/AttendantCatalog.ts';
import { BODY_OUTLINE, BODY_SHAPE, EYE_SHAPE } from '../constants/BodyShape.ts';
import { ANGLE, HAND_SHAPE }                   from '../constants/HandShape.ts';
import { EMBER_SHAPES }                        from '../constants/SleepMotion.ts';
import type { Drawing, Shape, TransformStep }  from '../drawing/Shape.ts';
import { markDefinitionOf }                    from '../marks/MarkCatalog.ts';
import type { PropName }                       from '../props/PropCatalog.ts';
import { PROP_NAMES, propDefinitionOf }        from '../props/PropCatalog.ts';
import type { HoldingHand }                    from '../props/PropDefinition.ts';
import { AnimationCurveUtil }                  from '../utils/AnimationCurveUtil.ts';

/** Below this opacity a shape counts as not drawn: a browser's pixel at that alpha does not show. */
const VISIBLE_OPACITY = 0.05;

/** A text's box, from its font size: the advance of each letter of a bold sans serif, its rise above the baseline and its drop below it. */
const TEXT_ADVANCE_PER_FONT_SIZE_OF_LETTER: Readonly<Record<string, number>> = Object.freeze({
  'H': 0.74, 'i': 0.28, '!': 0.3, '?': 0.55,
});
const TEXT_ADVANCE_PER_FONT_SIZE = 0.62;
const TEXT_RISE_PER_FONT_SIZE = 0.75;
const TEXT_DROP_PER_FONT_SIZE = 0.25;

/** An arc of a path is followed through this many points. */
const ARC_SAMPLE_COUNT = 24;

/** An affine transform as SVG writes one: a point's new x is `xFromX × x + xFromY × y + offsetX`, and its new y likewise. */
interface Matrix {
  readonly xFromX:  number;
  readonly yFromX:  number;
  readonly xFromY:  number;
  readonly yFromY:  number;
  readonly offsetX: number;
  readonly offsetY: number;
}

function matrixOf(xFromX: number, yFromX: number, xFromY: number, yFromY: number, offsetX: number, offsetY: number): Matrix {
  return {
    xFromX, yFromX, xFromY, yFromY, offsetX, offsetY,
  };
}

const IDENTITY: Matrix = matrixOf(1, 0, 0, 1, 0, 0);

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The right transform applied first, then the left one. */
function multiplied(left: Matrix, right: Matrix): Matrix {
  return matrixOf(
    (left.xFromX * right.xFromX) + (left.xFromY * right.yFromX),
    (left.yFromX * right.xFromX) + (left.yFromY * right.yFromX),
    (left.xFromX * right.xFromY) + (left.xFromY * right.yFromY),
    (left.yFromX * right.xFromY) + (left.yFromY * right.yFromY),
    (left.xFromX * right.offsetX) + (left.xFromY * right.offsetY) + left.offsetX,
    (left.yFromX * right.offsetX) + (left.yFromY * right.offsetY) + left.offsetY,
  );
}

function translation(offsetX: number, offsetY: number): Matrix {
  return matrixOf(1, 0, 0, 1, offsetX, offsetY);
}

function rotation(degrees: number, aboutX = 0, aboutY = 0): Matrix {
  const radians = AnimationCurveUtil.radiansOf(degrees);
  const turn = matrixOf(Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0);
  return multiplied(multiplied(translation(aboutX, aboutY), turn), translation(-aboutX, -aboutY));
}

function scaling(factorX: number, factorY: number): Matrix {
  return matrixOf(factorX, 0, 0, factorY, 0, 0);
}

function matrixOfStep(step: TransformStep): Matrix {
  if ('translateX' in step) return translation(step.translateX, step.translateY);
  if ('scaleX' in step) return scaling(step.scaleX, step.scaleY);
  if ('aboutX' in step) return rotation(step.rotateDegrees, step.aboutX, step.aboutY);
  return rotation(step.rotateDegrees);
}

/** SVG reads a transform list left to right, each step inside the one before it. */
function matrixOfSteps(steps: readonly TransformStep[]): Matrix {
  return steps.reduce<Matrix>((matrix, step) => multiplied(matrix, matrixOfStep(step)), IDENTITY);
}

function pointThrough(matrix: Matrix, point: Point): Point {
  return {
    x: (matrix.xFromX * point.x) + (matrix.xFromY * point.y) + matrix.offsetX,
    y: (matrix.yFromX * point.x) + (matrix.yFromY * point.y) + matrix.offsetY,
  };
}

function emptyBounds(): Bounds {
  return {
    minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
  };
}

function grown(bounds: Bounds, point: Point): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function boundsOfPoints(points: readonly Point[]): Bounds {
  const bounds = emptyBounds();
  for (const point of points) grown(bounds, point);
  return bounds;
}

/** The centre of an SVG arc from its end points (the specification's appendix B.2.4), followed through sampled points. */
function arcPointsOf(start: Point, end: Point, radiusX: number, radiusY: number, rotationDegrees: number, isLarge: boolean, sweeps: boolean): Point[] {
  if (radiusX === 0 || radiusY === 0) return [end];
  const rotationRadians = AnimationCurveUtil.radiansOf(rotationDegrees);
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const halfDeltaX = (start.x - end.x) / 2;
  const halfDeltaY = (start.y - end.y) / 2;
  const primeX = (cosine * halfDeltaX) + (sine * halfDeltaY);
  const primeY = (-sine * halfDeltaX) + (cosine * halfDeltaY);
  let arcRadiusX = Math.abs(radiusX);
  let arcRadiusY = Math.abs(radiusY);
  const radiiScale = ((primeX * primeX) / (arcRadiusX * arcRadiusX)) + ((primeY * primeY) / (arcRadiusY * arcRadiusY));
  if (radiiScale > 1) {
    arcRadiusX *= Math.sqrt(radiiScale);
    arcRadiusY *= Math.sqrt(radiiScale);
  }
  const numerator = Math.max(0, (arcRadiusX * arcRadiusX * arcRadiusY * arcRadiusY) - (arcRadiusX * arcRadiusX * primeY * primeY) - (arcRadiusY * arcRadiusY * primeX * primeX));
  const denominator = (arcRadiusX * arcRadiusX * primeY * primeY) + (arcRadiusY * arcRadiusY * primeX * primeX);
  const factor = (isLarge === sweeps ? -1 : 1) * Math.sqrt(denominator === 0 ? 0 : numerator / denominator);
  const centrePrimeX = factor * ((arcRadiusX * primeY) / arcRadiusY);
  const centrePrimeY = factor * (-(arcRadiusY * primeX) / arcRadiusX);
  const centreX = (cosine * centrePrimeX) - (sine * centrePrimeY) + ((start.x + end.x) / 2);
  const centreY = (sine * centrePrimeX) + (cosine * centrePrimeY) + ((start.y + end.y) / 2);
  const angleOf = (alongX: number, alongY: number): number => Math.atan2(alongY, alongX);
  const startAngle = angleOf((primeX - centrePrimeX) / arcRadiusX, (primeY - centrePrimeY) / arcRadiusY);
  let sweepAngle = angleOf((-primeX - centrePrimeX) / arcRadiusX, (-primeY - centrePrimeY) / arcRadiusY) - startAngle;
  if (sweeps && sweepAngle < 0) sweepAngle += 2 * Math.PI;
  if (!sweeps && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  return Array.from({ length: ARC_SAMPLE_COUNT + 1 }, (_unused, i) => {
    const angle = startAngle + ((sweepAngle * i) / ARC_SAMPLE_COUNT);
    const alongX = arcRadiusX * Math.cos(angle);
    const alongY = arcRadiusY * Math.sin(angle);
    return { x: (cosine * alongX) - (sine * alongY) + centreX, y: (sine * alongX) + (cosine * alongY) + centreY };
  });
}

const PATH_TOKEN_PATTERN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

const NUMBERS_PER_COMMAND: Readonly<Record<string, number>> = Object.freeze({
  m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0,
});

/** Every point a path passes through or pulls towards: its curves stay inside the hull of their control points. */
function pathPointsOf(pathData: string): Point[] {
  const tokens = pathData.match(PATH_TOKEN_PATTERN) ?? [];
  const points: Point[] = [];
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = current;
  let command = 'M';
  let index = 0;
  const numberAt = (offset: number): number => Number(tokens[index + offset]);
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    if (/[A-Za-z]/.test(token)) {
      command = token;
      index += 1;
      if (command.toLowerCase() === 'z') {
        current = subpathStart;
        continue;
      }
    }
    const lower = command.toLowerCase();
    const isRelative = command !== command.toUpperCase();
    const count = NUMBERS_PER_COMMAND[lower] ?? 0;
    const originX = isRelative ? current.x : 0;
    const originY = isRelative ? current.y : 0;
    const at = (offset: number): Point => ({ x: originX + numberAt(offset), y: originY + numberAt(offset + 1) });
    if (lower === 'h') {
      current = { x: originX + numberAt(0), y: current.y };
      points.push(current);
    } else if (lower === 'v') {
      current = { x: current.x, y: originY + numberAt(0) };
      points.push(current);
    } else if (lower === 'a') {
      const end = at(5);
      points.push(...arcPointsOf(current, end, numberAt(0), numberAt(1), numberAt(2), numberAt(3) !== 0, numberAt(4) !== 0));
      current = end;
    } else {
      for (let offset = 0; offset < count; offset += 2) points.push(at(offset));
      current = at(count - 2);
    }
    if (lower === 'm') {
      subpathStart = current;
      command = isRelative ? 'l' : 'L';
    }
    index += count;
  }
  return points;
}

/** The shape's own box, before its transform, without its stroke. */
function ownBoundsOf(shape: Shape): Bounds {
  switch (shape.kind) {
    case 'polygon':
      return boundsOfPoints(shape.points);
    case 'rectangle':
      return {
        minX: shape.x, maxX: shape.x + shape.width, minY: shape.y, maxY: shape.y + shape.height,
      };
    case 'line':
      return boundsOfPoints([{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }]);
    case 'circle':
      return {
        minX: shape.centreX - shape.radius, maxX: shape.centreX + shape.radius, minY: shape.centreY - shape.radius, maxY: shape.centreY + shape.radius,
      };
    case 'path':
      return boundsOfPoints(pathPointsOf(shape.pathData));
    case 'text': {
      const advance = [...shape.text].reduce((sum, letter) => sum + (TEXT_ADVANCE_PER_FONT_SIZE_OF_LETTER[letter] ?? TEXT_ADVANCE_PER_FONT_SIZE), 0);
      const halfWidth = (advance * shape.fontSize) / 2;
      return {
        minX: shape.x - halfWidth,
        maxX: shape.x + halfWidth,
        minY: shape.y - (shape.fontSize * TEXT_RISE_PER_FONT_SIZE),
        maxY: shape.y + (shape.fontSize * TEXT_DROP_PER_FONT_SIZE),
      };
    }
  }
}

/** The stroke's half width when the stroke shows, 0 when only the fill does, and null when neither shows. */
function visiblePaddingOf(shape: Shape, groupOpacity: number): number | null {
  const opacity = groupOpacity * (shape.opacity ?? 1);
  const fillShows = shape.kind !== 'line' && shape.kind !== 'text' ? shape.fill !== 'none' && (shape.fillOpacity ?? 1) * opacity >= VISIBLE_OPACITY : opacity >= VISIBLE_OPACITY;
  const strokeWidth = shape.stroke === undefined || shape.stroke === 'none' ? 0 : shape.strokeWidth ?? 1;
  const strokeShows = strokeWidth > 0 && (shape.strokeOpacity ?? 1) * opacity >= VISIBLE_OPACITY;
  if (strokeShows) return strokeWidth / 2;
  return fillShows ? 0 : null;
}

/** Facing left, a shape that is never mirrored is mirrored back about its own x, before its own transform. */
function shapeStepsOf(shape: Shape, facing: Facing): readonly TransformStep[] {
  const ownSteps = shape.transform ?? [];
  if (facing === 1 || shape.unmirroredAboutX === undefined) return ownSteps;
  return [{ translateX: 2 * shape.unmirroredAboutX, translateY: 0 }, { scaleX: -1, scaleY: 1 }, ...ownSteps];
}

/** The points a shape's outline passes through or pulls towards, where it has them; null for a box, a circle or a text. */
function outlinePointsOf(shape: Shape): readonly Point[] | null {
  if (shape.kind === 'polygon') return shape.points;
  if (shape.kind === 'line') return [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }];
  if (shape.kind === 'path') return pathPointsOf(shape.pathData);
  return null;
}

/** How far a length of 1 can stretch through the matrix: the padding of a stroke after its transform. */
function largestStretchOf(matrix: Matrix): number {
  return Math.max(Math.hypot(matrix.xFromX, matrix.yFromX), Math.hypot(matrix.xFromY, matrix.yFromY));
}

/** Points through the matrix, the box around them padded by the stroke after the transform. */
function grownByPoints(bounds: Bounds, points: readonly Point[], matrix: Matrix, padding: number): void {
  const moved = boundsOfPoints(points.map((point) => pointThrough(matrix, point)));
  if (moved.minX === Infinity) return;
  const stretchedPadding = padding * largestStretchOf(matrix);
  grown(bounds, { x: moved.minX - stretchedPadding, y: moved.minY - stretchedPadding });
  grown(bounds, { x: moved.maxX + stretchedPadding, y: moved.maxY + stretchedPadding });
}

function grownByShape(bounds: Bounds, shape: Shape, outer: Matrix, groupOpacity: number, facing: Facing): void {
  const padding = visiblePaddingOf(shape, groupOpacity);
  if (padding === null) return;
  if (shape.kind === 'text' && shape.text === '') return;
  const matrix = multiplied(outer, matrixOfSteps(shapeStepsOf(shape, facing)));
  const outlinePoints = outlinePointsOf(shape);
  if (outlinePoints !== null) {
    grownByPoints(bounds, outlinePoints, matrix, padding);
    return;
  }
  const own = ownBoundsOf(shape);
  const corners = [
    { x: own.minX - padding, y: own.minY - padding },
    { x: own.maxX + padding, y: own.minY - padding },
    { x: own.minX - padding, y: own.maxY + padding },
    { x: own.maxX + padding, y: own.maxY + padding },
  ];
  for (const corner of corners) grown(bounds, pointThrough(matrix, corner));
}

function grownByDrawing(bounds: Bounds, drawing: Drawing, outer: Matrix, facing: Facing): void {
  const opacity = drawing.opacity ?? 1;
  if (opacity < VISIBLE_OPACITY) return;
  const matrix = multiplied(outer, matrixOfSteps(drawing.transform ?? []));
  for (const shape of drawing.shapes) grownByShape(bounds, shape, matrix, opacity, facing);
}

function handCornersOf(hand: HandPose | null, sidewaysWidth: number): Point[] {
  if (hand === null || hand.radius <= HAND_SHAPE.DRAWN_MINIMUM_RADIUS_UNITS) return [];
  return Array.from({ length: hand.cornerCount }, (_unused, i) => {
    const angle = AnimationCurveUtil.radiansOf(hand.turnDegrees + HAND_SHAPE.FIRST_CORNER_OFFSET_DEGREES + (i * ANGLE.FULL_TURN_DEGREES / hand.cornerCount));
    return { x: hand.centreX + (Math.cos(angle) * hand.radius / sidewaysWidth), y: hand.centreY + (Math.sin(angle) * hand.radius) };
  });
}

function holdingHandOf(name: PropName, pose: Pose): HoldingHand | null {
  const holds = (hand: HandPose | null): hand is HandPose => hand !== null && typeof hand.placement === 'object' && hand.placement.heldTo === name;
  if (holds(pose.nearHand)) return pose.nearHand;
  return holds(pose.farHand) ? pose.farHand : null;
}

function grownByProp<Name extends PropName>(bounds: Bounds, name: Name, pose: Pose, flip: Matrix): void {
  const state = pose.props[name];
  if (state.shown <= 0) return;
  const drawing = propDefinitionOf(name).shapesOf(state, { facing: pose.body.facing, holdingHand: holdingHandOf(name, pose) });
  grownByDrawing(bounds, drawing, flip, pose.body.facing);
}

const BODY_POINTS = pathPointsOf(BODY_SHAPE.PATH);

/** In overlay units, the box of everything the pose draws but its page shapes, which a behaviour places on the page. */
function overlayBoundsOf(pose: Pose): Bounds {
  const bounds = emptyBounds();
  const { body } = pose;
  const originY = body.floorY - body.jumpHeight - body.hover - body.lift;
  const figure = translation(body.positionX + body.shake, originY);
  const flip = multiplied(figure, scaling(body.facing * body.sidewaysWidth, 1));
  const bodyMatrix = multiplied(flip, multiplied(rotation(body.leanDegrees), scaling(body.widthFactor, body.heightFactor)));
  const outlinePadding = body.fillOpacity >= 1 ? 0 : BODY_OUTLINE.STROKE_UNITS / 2;
  grownByPoints(bounds, BODY_POINTS, bodyMatrix, outlinePadding);
  const eyeWidth = EYE_SHAPE.WIDTH_UNITS / body.sidewaysWidth;
  if (1 - pose.eyes.happiness >= VISIBLE_OPACITY) {
    const faceOn = AnimationCurveUtil.clamp((body.sidewaysWidth - BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR) / (1 - BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR));
    const heights = [pose.eyes.height, pose.eyes.rightHeightOverride ?? pose.eyes.height];
    [EYE_SHAPE.LEFT_EYE_X_UNITS, EYE_SHAPE.RIGHT_EYE_X_UNITS].forEach((eyeX, i) => {
      const height = Math.max(0, heights[i] ?? pose.eyes.height);
      const left = (eyeX + pose.eyes.shift + ((1 - faceOn) * BODY_SHAPE.SIDEWAYS_EXTRA_SHIFT_UNITS)) / body.sidewaysWidth;
      const top = EYE_SHAPE.TOP_Y_UNITS + pose.eyes.lift + ((EYE_SHAPE.HEIGHT_UNITS - height) / 2);
      const slant = rotation(pose.eyes.slantDegrees * (i === 0 ? -1 : 1), left + (eyeWidth / 2), top + (height / 2));
      const eyeMatrix = multiplied(bodyMatrix, slant);
      for (const corner of [{ x: left, y: top }, { x: left + eyeWidth, y: top }, { x: left, y: top + height }, { x: left + eyeWidth, y: top + height }]) {
        grown(bounds, pointThrough(eyeMatrix, corner));
      }
    });
  }
  if (pose.eyes.happiness >= VISIBLE_OPACITY) {
    grownByShape(bounds, {
      kind: 'path', key: 'happy-eyes', pathData: EYE_SHAPE.HAPPY_EYES_PATH, fill: 'none', stroke: 'eye', strokeWidth: EYE_SHAPE.HAPPY_EYES_STROKE_UNITS,
    }, bodyMatrix, 1, 1);
  }
  for (const hand of [pose.farHand, pose.nearHand]) {
    for (const corner of handCornersOf(hand, body.sidewaysWidth)) grown(bounds, pointThrough(flip, corner));
  }
  for (const name of PROP_NAMES) grownByProp(bounds, name, pose, flip);
  const mark = pose.emoteMark;
  if (mark !== null && mark.opacity >= VISIBLE_OPACITY) {
    const markMatrix = multiplied(figure, matrixOfSteps([
      { translateX: body.facing * mark.anchorX, translateY: mark.anchorY },
      { scaleX: mark.scale, scaleY: mark.scale },
      { scaleX: mark.innerScaleX, scaleY: mark.innerScaleY },
    ]));
    const shapes = markDefinitionOf(mark.name).shapesOf(mark.details as never);
    for (const shape of shapes) grownByShape(bounds, shape, markMatrix, mark.opacity, 1);
  }
  const attendantOrigin = translation(body.positionX, originY);
  for (const definition of ATTENDANT_CATALOG) {
    const memberShapes = definition.shapesOf();
    for (const member of pose.attendants.filter((candidate) => candidate.name === definition.name)) {
      const memberMatrix = multiplied(attendantOrigin, matrixOfSteps([
        { translateX: body.facing * member.x, translateY: member.y },
        { rotateDegrees: member.turnDegrees },
        { scaleX: member.scale, scaleY: member.scale },
      ]));
      for (const shape of memberShapes) grownByShape(bounds, shape, memberMatrix, 1, 1);
    }
  }
  pose.sleep.embers.forEach((ember, i) => {
    const side = EMBER_SHAPES[i]?.SIDE_UNITS ?? 0;
    if (ember.opacity < VISIBLE_OPACITY || side === 0) return;
    const emberMatrix = multiplied(translation(body.positionX + ember.x, originY + ember.y), rotation(ember.turnDegrees));
    for (const corner of [{ x: 0, y: 0 }, { x: side, y: 0 }, { x: 0, y: side }, { x: side, y: side }]) grown(bounds, pointThrough(emberMatrix, corner));
  });
  return bounds;
}

/** What the pose draws, from its bottom tip on its floor, folded so the front is the side it faces. */
function drawnExtentOf(pose: Pose): DrawnExtent {
  const bounds = overlayBoundsOf(pose);
  const { positionX, floorY, facing } = pose.body;
  const leftUnits = positionX - bounds.minX;
  const rightUnits = bounds.maxX - positionX;
  return {
    backUnits:       facing === 1 ? leftUnits : rightUnits,
    frontUnits:      facing === 1 ? rightUnits : leftUnits,
    aboveFloorUnits: floorY - bounds.minY,
    belowFloorUnits: bounds.maxY - floorY,
  };
}

function unionOf(first: DrawnExtent, second: DrawnExtent): DrawnExtent {
  return {
    backUnits:       Math.max(first.backUnits, second.backUnits),
    frontUnits:      Math.max(first.frontUnits, second.frontUnits),
    aboveFloorUnits: Math.max(first.aboveFloorUnits, second.aboveFloorUnits),
    belowFloorUnits: Math.max(first.belowFloorUnits, second.belowFloorUnits),
  };
}

export const DrawnExtentMeasure = Object.freeze({ drawnExtentOf, unionOf, pathPointsOf });
