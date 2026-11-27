/**
 * Writes a drawn pose to an SVG overlay, in the layer order. It names no prop, mark or attendant: it asks each catalog's definitions for
 * their shapes, which `flint/drawing/ShapeWriter.ts` writes. Every element is made once and each frame only sets attributes, and only the
 * body takes pointer input.
 */
import type {
  EmoteMarkPose,
  EmoteMarkPoseOf,
  HandPose,
  Pose
} from './SpritePose.ts';
import { emoteMarkAtRest }                            from './SpritePose.ts';
import { ATTENDANT_CATALOG }                          from './attendants/AttendantCatalog.ts';
import type { AttendantName }                         from './attendants/AttendantCatalog.ts';
import type { AttendantMember }                       from './attendants/AttendantRoster.ts';
import { BODY_OUTLINE, BODY_SHAPE, EYE_SHAPE }        from './constants/BodyShape.ts';
import { ANGLE, HAND_SHAPE }                          from './constants/HandShape.ts';
import { OVERLAY }                                    from './constants/Overlay.ts';
import { EMBER_SHAPES }                               from './constants/SleepMotion.ts';
import type { GradientDefinition, Shape }             from './drawing/Shape.ts';
import type { ShapeWriter }                           from './drawing/ShapeWriter.ts';
import { createShapeWriter }                          from './drawing/ShapeWriter.ts';
import { SvgTextUtil }                                from './drawing/SvgTextUtil.ts';
import type { MarkName }                              from './marks/MarkCatalog.ts';
import { MARK_CATALOG, markDefinitionOf }             from './marks/MarkCatalog.ts';
import type { PlaceBox }                              from './mind/Perception.ts';
import type { PropName }                              from './props/PropCatalog.ts';
import { PROP_CATALOG, PROP_NAMES, propDefinitionOf } from './props/PropCatalog.ts';
import type { HoldingHand, PropLayer }                from './props/PropDefinition.ts';
import { AnimationCurveUtil }                         from './utils/AnimationCurveUtil.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The box of the confinement `nowhere`: nothing shows inside it. */
const NO_BOX: PlaceBox = Object.freeze({
  leftX: 0, rightX: 0, topY: 0, floorY: 0,
});

export interface SpriteRendererOptions {
  readonly document:         Document;
  readonly pixelsForOneUnit: number;
  /** False leaves the body blind to the pointer too, so no part of Flint takes a press. */
  readonly bodyTakesPointer: boolean;
}

/** Where the drawing may show: everywhere, nowhere (the box Flint stands in is not on the page), or inside a box in overlay units. */
export type DrawingConfinement =
  | { readonly kind: 'everywhere' }
  | { readonly kind: 'nowhere' }
  | { readonly kind: 'inside'; readonly box: PlaceBox };

export interface SpriteRenderer {
  /** The overlay; the caller places it in the host's page and removes it. */
  readonly element:     SVGSVGElement;
  /** The one element that takes pointer input. */
  readonly bodyElement: SVGPathElement;
  readonly draw:        (pose: Pose) => void;
  /** Holds every later drawing to the confinement until the next call; at the start the drawing shows everywhere. */
  readonly confine:     (confinement: DrawingConfinement) => void;
}

type AttributeValue = string | number;

type Attributes = Readonly<Record<string, AttributeValue>>;

const { numberText, paintText } = SvgTextUtil;

function translateText(offsetX: number, offsetY: number): string {
  return `translate(${numberText(offsetX)} ${numberText(offsetY)})`;
}

function attributeText(value: AttributeValue): string {
  return typeof value === 'number' ? numberText(value) : value;
}

/** The element factory of one document: every part the renderer draws itself is made here, with its attributes, under its parent. */
type ElementFactory = <Name extends keyof SVGElementTagNameMap>(name: Name, parent: Element | null, attributes?: Attributes) => SVGElementTagNameMap[Name];

function elementFactoryOf(document: Document): ElementFactory {
  return (name, parent, attributes = {}) => {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    for (const [attributeName, value] of Object.entries(attributes)) element.setAttribute(attributeName, attributeText(value));
    parent?.appendChild(element);
    return element;
  };
}

function setAttributes(element: Element, attributes: Attributes): void {
  for (const [attributeName, value] of Object.entries(attributes)) {
    const text = attributeText(value);
    if (element.getAttribute(attributeName) !== text) element.setAttribute(attributeName, text);
  }
}

function polygonPointsOf(hand: HandPose | null, sidewaysWidth: number): string {
  if (hand === null || hand.radius <= HAND_SHAPE.DRAWN_MINIMUM_RADIUS_UNITS) return '';
  return Array.from({ length: hand.cornerCount }, (_unused, i) => {
    const angle = AnimationCurveUtil.radiansOf(hand.turnDegrees + HAND_SHAPE.FIRST_CORNER_OFFSET_DEGREES + (i * ANGLE.FULL_TURN_DEGREES / hand.cornerCount));
    // In the sideways pose the centre moves with the width, but the hand keeps its shape.
    return `${numberText(hand.centreX + (Math.cos(angle) * hand.radius / sidewaysWidth))},${numberText(hand.centreY + (Math.sin(angle) * hand.radius))}`;
  }).join(' ');
}

/** The drawn hand held to this prop, the near hand first; null when neither is. */
function holdingHandOf(name: PropName, pose: Pose): HoldingHand | null {
  const holds = (hand: HandPose | null): hand is HandPose => hand !== null && typeof hand.placement === 'object' && hand.placement.heldTo === name;
  if (holds(pose.nearHand)) return pose.nearHand;
  return holds(pose.farHand) ? pose.farHand : null;
}

function shapesOfMark<Name extends MarkName>(mark: EmoteMarkPoseOf<Name>): readonly Shape[] {
  return markDefinitionOf(mark.name).shapesOf(mark.details);
}

function gradientsOfTheCatalogs(): readonly GradientDefinition[] {
  return [...PROP_CATALOG.flatMap((definition) => definition.gradients ?? []), ...MARK_CATALOG.flatMap((definition) => definition.gradients ?? [])];
}

export function createSpriteRenderer(options: SpriteRendererOptions): SpriteRenderer {
  const { document } = options;
  const make = elementFactoryOf(document);
  const svg = make('svg', null, {
    'aria-hidden': 'true', 'focusable': 'false', 'overflow': 'visible', [OVERLAY.MARKER_ATTRIBUTE]: '',
  });
  const definitions = make('defs', svg);
  for (const gradient of gradientsOfTheCatalogs()) {
    const gradientElement = make('linearGradient', definitions, {
      id: gradient.id, x1: 0, x2: 1, y1: 0, y2: 0,
    });
    for (const stop of gradient.stops) make('stop', gradientElement, { 'offset': stop.offset, 'stop-color': paintText(stop.colour) });
  }
  const occlusionClip = make('clipPath', definitions, { id: OVERLAY.OCCLUSION_CLIP_ID, clipPathUnits: 'userSpaceOnUse' });
  const occlusionRectangle = make('rect', occlusionClip);
  const confinementClip = make('clipPath', definitions, { id: OVERLAY.CONFINEMENT_CLIP_ID, clipPathUnits: 'userSpaceOnUse' });
  const confinementRectangle = make('rect', confinementClip);

  const scaled = make('g', svg, { transform: `scale(${numberText(options.pixelsForOneUnit)})` });
  const pageWriter = createShapeWriter(document, scaled, 'undisplayed', OVERLAY.PAGE_PART_NAME);
  const occluded = make('g', scaled);
  const embers = EMBER_SHAPES.map((ember) => make('rect', occluded, {
    width: ember.SIDE_UNITS, height: ember.SIDE_UNITS, fill: paintText(ember.COLOUR), opacity: 0,
  }));
  const attendantWriters = new Map<AttendantName, ShapeWriter>(ATTENDANT_CATALOG.map((definition) => [
    definition.name, createShapeWriter(document, occluded, 'undisplayed', definition.name),
  ]));
  const figure = make('g', occluded);
  const flip = make('g', figure);

  const farHand = make('polygon', flip, { fill: paintText('hand') });
  const propWriters = new Map<PropName, ShapeWriter>();
  const writePropsOfLayer = (layer: PropLayer): void => {
    for (const name of PROP_NAMES) {
      if (propDefinitionOf(name).layer === layer) propWriters.set(name, createShapeWriter(document, flip, 'transparent', name));
    }
  };
  // Every element is made at the start, hidden: the browser rasterises the figure alike whatever shows.
  const madeHidden = <Name extends PropName>(name: Name): void => {
    const writer = propWriters.get(name);
    writer?.draw(propDefinitionOf(name).shapesOf(propDefinitionOf(name).hidden, { facing: 1, holdingHand: null }), 1);
    writer?.draw(null, 1);
  };
  writePropsOfLayer('behind-body');

  const body = make('g', flip);
  const bodyElement = make('path', body, { 'd': BODY_SHAPE.PATH, 'fill': paintText('body'), 'pointer-events': options.bodyTakesPointer ? 'visiblePainted' : 'none' });
  const tint = make('path', body, { d: BODY_SHAPE.PATH, display: 'none' });
  const glow = make('path', body, { d: BODY_SHAPE.GLOW_PATH, fill: paintText('glow'), opacity: 0 });
  const eyes = [EYE_SHAPE.LEFT_EYE_X_UNITS, EYE_SHAPE.RIGHT_EYE_X_UNITS].map(() => make('rect', body, { fill: paintText('eye') }));
  const happyEyes = make('path', body, {
    'd': EYE_SHAPE.HAPPY_EYES_PATH, 'fill': 'none', 'stroke': paintText('eye'), 'stroke-width': EYE_SHAPE.HAPPY_EYES_STROKE_UNITS, 'stroke-linecap': 'round', 'opacity': 0,
  });

  writePropsOfLayer('in-front-of-body');
  const nearHand = make('polygon', flip, { fill: paintText('hand') });
  writePropsOfLayer('in-front-of-all');

  for (const name of PROP_NAMES) madeHidden(name);
  const markWriters = new Map<MarkName, ShapeWriter>(MARK_CATALOG.map((definition) => [definition.name, createShapeWriter(document, figure, 'undisplayed', definition.name)]));
  for (const definition of MARK_CATALOG) {
    const writer = markWriters.get(definition.name);
    writer?.draw({ shapes: shapesOfMark(emoteMarkAtRest(definition.name)) }, 1);
    writer?.draw(null, 1);
  }

  const drawBody = (pose: Pose): void => {
    setAttributes(body, { transform: `rotate(${numberText(pose.body.leanDegrees)}) scale(${numberText(pose.body.widthFactor)} ${numberText(pose.body.heightFactor)})` });
    if (pose.body.fillOpacity >= 1) {
      for (const name of ['fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity']) bodyElement.removeAttribute(name);
    } else {
      setAttributes(bodyElement, {
        'fill-opacity':     pose.body.fillOpacity,
        'stroke':           paintText('body'),
        'stroke-width':     BODY_OUTLINE.STROKE_UNITS,
        'stroke-dasharray': `${BODY_OUTLINE.DASH_UNITS} ${BODY_OUTLINE.GAP_UNITS}`,
        'stroke-opacity':   1 - pose.body.fillOpacity,
      });
    }
    const { tint: bodyTint } = pose.body;
    setAttributes(tint, bodyTint.amount > 0 ? { display: 'inline', fill: paintText(bodyTint.role), opacity: bodyTint.amount } : { display: 'none' });
    setAttributes(glow, { opacity: pose.sleep.glowOpacity });
  };

  const drawEyes = (pose: Pose): void => {
    const { sidewaysWidth } = pose.body;
    const faceOn = AnimationCurveUtil.clamp((sidewaysWidth - BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR) / (1 - BODY_SHAPE.SIDEWAYS_WIDTH_FACTOR));
    // Sideways, the eyes keep their drawn width and their distance on the screen, and move further to the side Flint faces.
    const eyeWidth = EYE_SHAPE.WIDTH_UNITS / sidewaysWidth;
    const heights = [pose.eyes.height, pose.eyes.rightHeightOverride ?? pose.eyes.height];
    const slantSigns = [-1, 1];
    [EYE_SHAPE.LEFT_EYE_X_UNITS, EYE_SHAPE.RIGHT_EYE_X_UNITS].forEach((eyeX, i) => {
      const height = heights[i] ?? pose.eyes.height;
      const left = (eyeX + pose.eyes.shift + ((1 - faceOn) * BODY_SHAPE.SIDEWAYS_EXTRA_SHIFT_UNITS)) / sidewaysWidth;
      const top = EYE_SHAPE.TOP_Y_UNITS + pose.eyes.lift + ((EYE_SHAPE.HEIGHT_UNITS - height) / 2);
      const eye = eyes[i];
      if (eye === undefined) return;
      setAttributes(eye, {
        x:         left,
        y:         top,
        width:     eyeWidth,
        height:    Math.max(0, height),
        opacity:   1 - pose.eyes.happiness,
        transform: `rotate(${numberText(pose.eyes.slantDegrees * (slantSigns[i] ?? 1))} ${numberText(left + (eyeWidth / 2))} ${numberText(top + (height / 2))})`,
      });
    });
    setAttributes(happyEyes, { opacity: pose.eyes.happiness });
  };

  const drawProp = <Name extends PropName>(name: Name, pose: Pose): void => {
    const state = pose.props[name];
    const writer = propWriters.get(name);
    if (state.shown <= 0) {
      writer?.draw(null, pose.body.facing);
      return;
    }
    writer?.draw(propDefinitionOf(name).shapesOf(state, { facing: pose.body.facing, holdingHand: holdingHandOf(name, pose) }), pose.body.facing);
  };


  /** The mark is drawn outside the mirrored group, so only its anchor follows the facing. */
  const drawMark = (mark: EmoteMarkPose | null, pose: Pose): void => {
    for (const [name, writer] of markWriters) {
      if (mark?.name !== name) {
        writer.draw(null, pose.body.facing);
        continue;
      }
      writer.draw({
        opacity:   mark.opacity,
        transform: [
          { translateX: pose.body.facing * mark.anchorX, translateY: mark.anchorY },
          { scaleX: mark.scale, scaleY: mark.scale },
          { scaleX: mark.innerScaleX, scaleY: mark.innerScaleY },
        ],
        shapes: shapesOfMark(mark),
      }, 1);
    }
  };

  /** Behind Flint with the embers: placed at its feet with the hover and lift, never shaken or leaned; the x of each member mirrors. */
  const drawAttendants = (members: readonly AttendantMember[], pose: Pose, originY: number): void => {
    for (const definition of ATTENDANT_CATALOG) {
      const ownMembers = members.filter((member) => member.name === definition.name);
      const writer = attendantWriters.get(definition.name);
      if (ownMembers.length === 0) {
        writer?.draw(null, pose.body.facing);
        continue;
      }
      const memberShapes = definition.shapesOf();
      writer?.draw({
        transform: [{ translateX: pose.body.positionX, translateY: originY }],
        shapes:    ownMembers.flatMap((member) => memberShapes.map((shape): Shape => ({
          ...shape,
          key:       `${member.index}:${shape.key}`,
          transform: [
            { translateX: pose.body.facing * member.x, translateY: member.y },
            { rotateDegrees: member.turnDegrees },
            { scaleX: member.scale, scaleY: member.scale },
            ...(shape.transform ?? []),
          ],
        }))),
      }, 1);
    }
  };

  const drawOcclusion = (pose: Pose): void => {
    if (pose.occlusion === null) {
      occluded.removeAttribute('clip-path');
      return;
    }
    const extent = OVERLAY.OCCLUSION_EXTENT_UNITS;
    setAttributes(occlusionRectangle, {
      x:      pose.occlusion.hiddenSide === 1 ? pose.occlusion.edgeX - extent : pose.occlusion.edgeX,
      y:      -extent / 2,
      width:  extent,
      height: extent,
    });
    setAttributes(occluded, { 'clip-path': `url(#${OVERLAY.OCCLUSION_CLIP_ID})` });
  };

  /** Behind Flint and its embers, in overlay units: never placed at Flint, never mirrored. */
  const drawPage = (pose: Pose): void => {
    const { page } = pose;
    pageWriter.draw(page.shapes.length === 0 ? null : { opacity: page.opacity, shapes: page.shapes }, 1);
  };

  const draw = (pose: Pose): void => {
    drawPage(pose);
    const originY = pose.body.floorY - pose.body.jumpHeight - pose.body.hover - pose.body.lift;
    setAttributes(figure, { transform: translateText(pose.body.positionX + pose.body.shake, originY) });
    setAttributes(flip, { transform: `scale(${numberText(pose.body.facing * pose.body.sidewaysWidth)} 1)` });
    drawBody(pose);
    setAttributes(farHand, { points: polygonPointsOf(pose.farHand, pose.body.sidewaysWidth) });
    setAttributes(nearHand, { points: polygonPointsOf(pose.nearHand, pose.body.sidewaysWidth) });
    drawEyes(pose);
    for (const name of PROP_NAMES) drawProp(name, pose);
    drawMark(pose.emoteMark, pose);
    drawAttendants(pose.attendants, pose, originY);
    embers.forEach((ember, i) => {
      const emberPose = pose.sleep.embers[i];
      setAttributes(ember, emberPose === undefined
        ? { opacity: 0 }
        : { opacity: emberPose.opacity, transform: `${translateText(pose.body.positionX + emberPose.x, originY + emberPose.y)} rotate(${numberText(emberPose.turnDegrees)})` });
    });
    drawOcclusion(pose);
  };

  /** The clip sits on the scaled group, so the box is in overlay units, and it holds the page shapes as well as Flint. */
  const confine = (confinement: DrawingConfinement): void => {
    if (confinement.kind === 'everywhere') {
      scaled.removeAttribute('clip-path');
      return;
    }
    const box = confinement.kind === 'inside' ? confinement.box : NO_BOX;
    setAttributes(confinementRectangle, {
      x:      box.leftX,
      y:      box.topY,
      width:  Math.max(0, box.rightX - box.leftX),
      height: Math.max(0, box.floorY - box.topY),
    });
    setAttributes(scaled, { 'clip-path': `url(#${OVERLAY.CONFINEMENT_CLIP_ID})` });
  };

  return {
    element: svg, bodyElement, draw, confine,
  };
}
