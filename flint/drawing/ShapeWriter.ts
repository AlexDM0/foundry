/**
 * The one writer of drawings: it keeps one SVG group, and in it one element for each shape key, made once with `createElementNS` and then
 * only given attributes. Each frame it puts the elements in the order of the drawing, takes out those the drawing no longer has, and keeps
 * them for a later frame. A drawing of a new prop, mark or attendant adds no code here.
 */
import type { Facing } from '../SpriteGeometry.ts';
import { OVERLAY }     from '../constants/Overlay.ts';
import type {
  Drawing,
  Shape,
  ShapeKind,
  TransformStep
} from './Shape.ts';
import { SvgTextUtil } from './SvgTextUtil.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const ELEMENT_NAME_OF_KIND: Readonly<Record<ShapeKind, keyof SVGElementTagNameMap>> = Object.freeze({
  polygon:   'polygon',
  rectangle: 'rect',
  line:      'line',
  circle:    'circle',
  path:      'path',
  text:      'text',
});

type Attributes = Readonly<Record<string, string>>;

/** How a hidden drawing is hidden: kept in the layout at opacity 0, or taken out of it with `display: none`. */
export type HiddenDrawing = 'transparent' | 'undisplayed';

export interface ShapeWriter {
  /** The group the writer draws in; the caller places it in the layer order. */
  readonly element: SVGGElement;
  /** Null hides the group and keeps its elements as they were; facing left mirrors back each shape that is never mirrored. */
  readonly draw:    (drawing: Drawing | null, facing: Facing) => void;
}

interface WrittenShape {
  readonly element: SVGElement;
  readonly kind:    ShapeKind;
  attributeNames:   readonly string[];
}

function geometryAttributesOf(shape: Shape): Attributes {
  const { numberText } = SvgTextUtil;
  switch (shape.kind) {
    case 'polygon':
      return { points: SvgTextUtil.pointsText(shape.points) };
    case 'rectangle':
      return {
        x:      numberText(shape.x),
        y:      numberText(shape.y),
        width:  numberText(shape.width),
        height: numberText(shape.height),
        ...(shape.cornerRadius === undefined ? {} : { rx: numberText(shape.cornerRadius) }),
      };
    case 'line':
      return {
        x1: numberText(shape.x1), y1: numberText(shape.y1), x2: numberText(shape.x2), y2: numberText(shape.y2),
      };
    case 'circle':
      return { cx: numberText(shape.centreX), cy: numberText(shape.centreY), r: numberText(shape.radius) };
    case 'path':
      return { d: shape.pathData };
    case 'text':
      return {
        'x':           numberText(shape.x),
        'y':           numberText(shape.y),
        'text-anchor': 'middle',
        'font-family': shape.fontFamily,
        'font-size':   numberText(shape.fontSize),
        'font-weight': numberText(shape.fontWeight),
      };
  }
}

/** Facing left, a shape that is never mirrored is mirrored back about its own x, before its own transform. */
function transformOf(shape: Shape, facing: Facing): readonly TransformStep[] {
  const ownTransform = shape.transform ?? [];
  if (facing === 1 || shape.unmirroredAboutX === undefined) return ownTransform;
  return [{ translateX: 2 * shape.unmirroredAboutX, translateY: 0 }, { scaleX: -1, scaleY: 1 }, ...ownTransform];
}

function styleAttributesOf(shape: Shape, facing: Facing): Attributes {
  const { numberText } = SvgTextUtil;
  const transform = transformOf(shape, facing);
  return {
    ...(shape.fill === undefined ? {} : { 'fill': SvgTextUtil.paintText(shape.fill) }),
    ...(shape.fillOpacity === undefined ? {} : { 'fill-opacity': numberText(shape.fillOpacity) }),
    ...(shape.stroke === undefined ? {} : { 'stroke': SvgTextUtil.paintText(shape.stroke) }),
    ...(shape.strokeWidth === undefined ? {} : { 'stroke-width': numberText(shape.strokeWidth) }),
    ...(shape.strokeOpacity === undefined ? {} : { 'stroke-opacity': numberText(shape.strokeOpacity) }),
    ...(shape.dash === undefined ? {} : { 'stroke-dasharray': `${numberText(shape.dash[0])} ${numberText(shape.dash[1])}` }),
    ...(shape.lineCap === undefined ? {} : { 'stroke-linecap': shape.lineCap }),
    ...(shape.lineJoin === undefined ? {} : { 'stroke-linejoin': shape.lineJoin }),
    ...(shape.opacity === undefined ? {} : { opacity: numberText(shape.opacity) }),
    ...(transform.length === 0 ? {} : { transform: SvgTextUtil.transformText(transform) }),
  };
}

function setChangedAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
}

/** `partName` names the prop, mark or attendant the group draws, on the group's part attribute. */
export function createShapeWriter(document: Document, parent: Element, hiddenAs: HiddenDrawing, partName: string): ShapeWriter {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.setAttribute(OVERLAY.PART_ATTRIBUTE, partName);
  parent.appendChild(group);
  const writtenByKey = new Map<string, WrittenShape>();

  const writtenShapeOf = (shape: Shape): WrittenShape => {
    const existing = writtenByKey.get(shape.key);
    if (existing?.kind === shape.kind) return existing;
    existing?.element.remove();
    const made: WrittenShape = { element: document.createElementNS(SVG_NAMESPACE, ELEMENT_NAME_OF_KIND[shape.kind]), kind: shape.kind, attributeNames: [] };
    writtenByKey.set(shape.key, made);
    return made;
  };

  const write = (shape: Shape, facing: Facing): SVGElement => {
    const written = writtenShapeOf(shape);
    const attributes = { ...geometryAttributesOf(shape), ...styleAttributesOf(shape, facing) };
    for (const name of written.attributeNames) {
      if (!Object.hasOwn(attributes, name)) written.element.removeAttribute(name);
    }
    setChangedAttributes(written.element, attributes);
    written.attributeNames = Object.keys(attributes);
    if (shape.kind === 'text' && written.element.textContent !== shape.text) written.element.textContent = shape.text;
    return written.element;
  };

  const draw = (drawing: Drawing | null, facing: Facing): void => {
    if (drawing === null) {
      setChangedAttributes(group, hiddenAs === 'transparent' ? { opacity: '0' } : { display: 'none' });
      return;
    }
    const elements = drawing.shapes.map((shape) => write(shape, facing));
    const orderIsKept = elements.length === group.childNodes.length && elements.every((element, i) => group.childNodes[i] === element);
    if (!orderIsKept) group.replaceChildren(...elements);
    const { numberText } = SvgTextUtil;
    const transform = drawing.transform ?? [];
    setChangedAttributes(group, { ...(hiddenAs === 'transparent' ? {} : { display: 'inline' }), opacity: numberText(drawing.opacity ?? 1) });
    if (transform.length === 0) group.removeAttribute('transform');
    else setChangedAttributes(group, { transform: SvgTextUtil.transformText(transform) });
  };

  return { element: group, draw };
}
