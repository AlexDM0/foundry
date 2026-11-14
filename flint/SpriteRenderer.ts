/**
 * Writes a drawn pose to an SVG overlay, in the layer order of `01-character.md`. It knows nothing about behaviour. Every element is made
 * once with `createElementNS`, and each frame only sets attributes; every colour is a `var(--flint-*, default)`. The pose mirrors with the
 * facing, except the emote marks, the ticks, and the direction of reading and writing. Only the body takes pointer input.
 */
import type {
  EmoteMarkName,
  EmoteMarkPose,
  Facing,
  HandPose,
  Pose
} from './SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE } from './constants/BodyShape.ts';
import {
  ANGER_VEIN_SHAPE,
  EMBER_SHAPES,
  HAPPY_GLINTS_SHAPE,
  LIGHTBULB_SHAPE,
  MARK_TEXT_SHAPE,
  SWEAT_BEADS_SHAPE,
  SWEAT_DROP_SHAPE,
  THINKING_DOTS_SHAPE
} from './constants/EmoteMarkShapes.ts';
import { HAND_SHAPE, ANGLE }    from './constants/HandShape.ts';
import { OVERLAY }              from './constants/Overlay.ts';
import type { FlintColourRole } from './constants/Palette.ts';
import { FLINT_COLOURS }        from './constants/Palette.ts';
import {
  BOLT_SHAPE,
  BOOK_SHAPE,
  CROSS_SHAPE,
  HOLOGRAM_SHAPE,
  KEYBOARD_SHAPE,
  LOOKING_GLASS_SHAPE,
  MERGE_BLOCK_SHAPE,
  NOTEPAD_SHAPE,
  PAPER_POINTS,
  PAPER_SLOPE,
  SEARCH_BAR_SHAPE,
  SHEET_SHAPE,
  STACKED_PAGES,
  TICK_SHAPE,
  TICKET_SHAPE
} from './constants/PropShapes.ts';
import { AnimationCurveUtil } from './utils/AnimationCurveUtil.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface SpriteRendererOptions {
  readonly document:         Document;
  readonly pixelsForOneUnit: number;
}

export interface SpriteRenderer {
  /** The overlay; the caller places it in the host's page and removes it. */
  readonly element:     SVGSVGElement;
  /** The one element that takes pointer input. */
  readonly bodyElement: SVGPathElement;
  readonly draw:        (pose: Pose) => void;
}

type AttributeValue = string | number;

function colourOf(role: FlintColourRole): string {
  const colour = FLINT_COLOURS[role];
  return `var(${colour.property}, ${colour.fallback})`;
}

function numberText(value: number): string {
  return String(Number(value.toFixed(OVERLAY.ATTRIBUTE_DECIMALS)) + 0);
}

function translateText(offsetX: number, offsetY: number): string {
  return `translate(${numberText(offsetX)} ${numberText(offsetY)})`;
}

/** Placed at a point, then turned around it: a spark, a bead or an ember. */
function placedAndTurned(placed: { readonly x: number; readonly y: number; readonly turnDegrees: number; readonly opacity: number } | undefined): Attributes {
  return placed === undefined ? { opacity: 0 } : { opacity: placed.opacity, transform: `${translateText(placed.x, placed.y)} rotate(${numberText(placed.turnDegrees)})` };
}

function attributeText(value: AttributeValue): string {
  return typeof value === 'number' ? numberText(value) : value;
}

/** The element factory of one document: every part is made here, with its attributes, under its parent. */
type Attributes = Readonly<Record<string, AttributeValue>>;

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

/** A written line grows from its left end on the screen: facing left, it starts at the far end of the paper in Flint's own coordinates. */
function writtenLineOf(startX: number, startY: number, fullLength: number, writtenLength: number, facing: Facing): Attributes {
  const from = facing === 1 ? 0 : fullLength;
  const to = facing === 1 ? writtenLength : fullLength - writtenLength;
  return {
    x1:      startX + from,
    y1:      startY + (PAPER_SLOPE * from),
    x2:      startX + to,
    y2:      startY + (PAPER_SLOPE * to),
    opacity: writtenLength > 0 ? 1 : 0,
  };
}

/** A tick never mirrors: facing left, it is mirrored back about its own centre. */
function tickTransformOf(startX: number, facing: Facing): string {
  return facing === 1 ? '' : `translate(${numberText((2 * startX) + TICK_SHAPE.WIDTH_UNITS)} 0) scale(-1 1)`;
}

const EMOTE_MARK_NAMES: readonly EmoteMarkName[] = ['anger-vein', 'sweat-drop', 'exclamation', 'question', 'thinking-dots', 'lightbulb', 'happy-glints', 'sweat-beads', 'greeting'];

export function createSpriteRenderer(options: SpriteRendererOptions): SpriteRenderer {
  const make = elementFactoryOf(options.document);
  const svg = make('svg', null, {
    'aria-hidden': 'true', 'focusable': 'false', 'overflow': 'visible', [OVERLAY.MARKER_ATTRIBUTE]: '',
  });
  const definitions = make('defs', svg);
  const bulbGlassGradient = make('linearGradient', definitions, {
    id: OVERLAY.BULB_GLASS_GRADIENT_ID, x1: 0, x2: 1, y1: 0, y2: 0,
  });
  make('stop', bulbGlassGradient, { 'offset': 0, 'stop-color': colourOf('bulbGlassLight') });
  make('stop', bulbGlassGradient, { 'offset': LIGHTBULB_SHAPE.GLASS_MIDDLE_STOP, 'stop-color': colourOf('bulbGlassMiddle') });
  make('stop', bulbGlassGradient, { 'offset': 1, 'stop-color': colourOf('bulbGlassDeep') });
  const bulbFittingGradient = make('linearGradient', definitions, {
    id: OVERLAY.BULB_FITTING_GRADIENT_ID, x1: 0, x2: 1, y1: 0, y2: 0,
  });
  make('stop', bulbFittingGradient, { 'offset': 0, 'stop-color': colourOf('bulbFittingDark') });
  make('stop', bulbFittingGradient, { 'offset': LIGHTBULB_SHAPE.FITTING_SHINE_STOP, 'stop-color': colourOf('bulbFittingShine') });
  make('stop', bulbFittingGradient, { 'offset': LIGHTBULB_SHAPE.FITTING_MIDDLE_STOP, 'stop-color': colourOf('bulbFittingMiddle') });
  make('stop', bulbFittingGradient, { 'offset': 1, 'stop-color': colourOf('bulbFittingShadow') });
  const occlusionClip = make('clipPath', definitions, { id: OVERLAY.OCCLUSION_CLIP_ID, clipPathUnits: 'userSpaceOnUse' });
  const occlusionRectangle = make('rect', occlusionClip);

  const scaled = make('g', svg, { transform: `scale(${numberText(options.pixelsForOneUnit)})` });
  const occluded = make('g', scaled);
  const embers = EMBER_SHAPES.map((ember) => make('rect', occluded, {
    width: ember.SIDE_UNITS, height: ember.SIDE_UNITS, fill: colourOf(ember.COLOUR), opacity: 0,
  }));
  const figure = make('g', occluded);
  const flip = make('g', figure);

  const farHand = make('polygon', flip, { fill: colourOf('hand') });

  const keyboard = make('g', flip, { opacity: 0 });
  make('rect', keyboard, {
    'x':            KEYBOARD_SHAPE.X_UNITS,
    'y':            KEYBOARD_SHAPE.Y_UNITS,
    'width':        KEYBOARD_SHAPE.WIDTH_UNITS,
    'height':       KEYBOARD_SHAPE.HEIGHT_UNITS,
    'rx':           KEYBOARD_SHAPE.CORNER_RADIUS_UNITS,
    'fill':         colourOf('keyboard'),
    'stroke':       colourOf('graphite'),
    'stroke-width': KEYBOARD_SHAPE.STROKE_UNITS,
    'transform':    `rotate(${KEYBOARD_SHAPE.TURN_DEGREES} ${KEYBOARD_SHAPE.TURN_CENTRE_X_UNITS} ${KEYBOARD_SHAPE.TURN_CENTRE_Y_UNITS})`,
  });

  const bolt = make('rect', flip, {
    x: BOLT_SHAPE.X_UNITS, y: BOLT_SHAPE.Y_UNITS, width: BOLT_SHAPE.WIDTH_UNITS, height: BOLT_SHAPE.HEIGHT_UNITS, fill: colourOf('bolt'), opacity: 0,
  });

  const sheet = make('g', flip, { opacity: 0 });
  const stackedPages = [...STACKED_PAGES].reverse().map((page) => make('polygon', sheet, {
    'points':          PAPER_POINTS,
    'fill':            colourOf('paperStacked'),
    'stroke':          colourOf('paperText'),
    'stroke-width':    SHEET_SHAPE.STACKED_PAGE_STROKE_UNITS,
    'stroke-linejoin': 'round',
    'opacity':         0,
    'transform':       `${translateText(page.OFFSET_X_UNITS, page.OFFSET_Y_UNITS)} `
      + `rotate(${page.TURN_DEGREES} ${SHEET_SHAPE.STACKED_PAGE_TURN_CENTRE_X_UNITS} ${SHEET_SHAPE.STACKED_PAGE_TURN_CENTRE_Y_UNITS})`,
  })).reverse();
  make('polygon', sheet, {
    'points': PAPER_POINTS, 'fill': colourOf('paper'), 'stroke': colourOf('paperEdge'), 'stroke-width': SHEET_SHAPE.STROKE_UNITS, 'stroke-linejoin': 'round',
  });
  const sheetLines = Array.from({ length: SHEET_SHAPE.LINE_COUNT }, (_unused, i) => {
    const lineY = SHEET_SHAPE.FIRST_LINE_Y_UNITS + (i * SHEET_SHAPE.LINE_SPACING_UNITS);
    return make('path', sheet, {
      'd':              `M${SHEET_SHAPE.LINE_START_X_UNITS} ${lineY} L${SHEET_SHAPE.LINE_END_X_UNITS} ${numberText(lineY + SHEET_SHAPE.LINE_DROP_UNITS)}`,
      'fill':           'none',
      'stroke':         colourOf('paperText'),
      'stroke-width':   SHEET_SHAPE.LINE_STROKE_UNITS,
      'stroke-linecap': 'round',
    });
  });
  const tickAttributes = {
    'fill': 'none', 'stroke': colourOf('done'), 'stroke-width': TICK_SHAPE.STROKE_UNITS, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'opacity': 0,
  } as const;
  const sheetTick = make('path', sheet, { ...tickAttributes, d: `M${TICK_SHAPE.SHEET_START_X_UNITS} ${TICK_SHAPE.SHEET_START_Y_UNITS} ${TICK_SHAPE.RELATIVE_PATH}` });
  const sheetCross = make('path', sheet, {
    'd': CROSS_SHAPE.PATH, 'fill': 'none', 'stroke': colourOf('alarm'), 'stroke-width': CROSS_SHAPE.STROKE_UNITS, 'stroke-linecap': 'round', 'opacity': 0,
  });

  const merge = make('g', flip, { opacity: 0 });
  const blockAttributes = {
    x: MERGE_BLOCK_SHAPE.X_UNITS, width: MERGE_BLOCK_SHAPE.WIDTH_UNITS, height: MERGE_BLOCK_SHAPE.HEIGHT_UNITS, rx: MERGE_BLOCK_SHAPE.CORNER_RADIUS_UNITS,
  } as const;
  const mergeTop = make('rect', merge, { ...blockAttributes, fill: colourOf('emberLight') });
  const mergeBottom = make('rect', merge, { ...blockAttributes, fill: colourOf('graphite') });
  const merged = make('rect', merge, {
    ...blockAttributes, y: MERGE_BLOCK_SHAPE.MERGED_Y_UNITS, height: MERGE_BLOCK_SHAPE.MERGED_HEIGHT_UNITS, fill: colourOf('done'),
  });
  const mergeTick = make('path', merge, { ...tickAttributes, d: `M${TICK_SHAPE.MERGE_START_X_UNITS} ${TICK_SHAPE.MERGE_START_Y_UNITS} ${TICK_SHAPE.RELATIVE_PATH}` });
  const sparkHalf = MERGE_BLOCK_SHAPE.SPARK_SIDE_UNITS / 2;
  const sparks = Array.from({ length: MERGE_BLOCK_SHAPE.SPARK_COUNT }, () => make('rect', merge, {
    x: -sparkHalf, y: -sparkHalf, width: MERGE_BLOCK_SHAPE.SPARK_SIDE_UNITS, height: MERGE_BLOCK_SHAPE.SPARK_SIDE_UNITS, fill: colourOf('body'), opacity: 0,
  }));

  const book = make('g', flip, {
    opacity:   0,
    transform: `translate(0 ${BOOK_SHAPE.DROP_UNITS}) rotate(${BOOK_SHAPE.TILT_DEGREES} ${BOOK_SHAPE.TILT_CENTRE_X_UNITS} ${BOOK_SHAPE.TILT_CENTRE_Y_UNITS})`,
  });
  make('polygon', book, {
    'points': BOOK_SHAPE.COVER_POINTS, 'fill': colourOf('hand'), 'stroke': colourOf('hand'), 'stroke-width': BOOK_SHAPE.COVER_STROKE_UNITS, 'stroke-linejoin': 'round',
  });
  make('polygon', book, { points: BOOK_SHAPE.BOOKMARK_POINTS, fill: colourOf('body') });
  make('path', book, {
    'd': BOOK_SHAPE.PAGES_BELOW_PATH, 'fill': 'none', 'stroke': colourOf('paperFold'), 'stroke-width': BOOK_SHAPE.PAGES_BELOW_STROKE_UNITS,
  });
  const pageAttributes = {
    'fill': colourOf('paper'), 'stroke': colourOf('paperText'), 'stroke-width': BOOK_SHAPE.PAGE_STROKE_UNITS, 'stroke-linejoin': 'round',
  } as const;
  make('path', book, { ...pageAttributes, d: BOOK_SHAPE.LEFT_PAGE_PATH });
  make('path', book, { ...pageAttributes, d: BOOK_SHAPE.RIGHT_PAGE_PATH });
  make('path', book, {
    'd': BOOK_SHAPE.TEXT_PATH, 'fill': 'none', 'stroke': colourOf('paperText'), 'stroke-width': BOOK_SHAPE.TEXT_STROKE_UNITS, 'stroke-linecap': 'round',
  });
  const turningPage = make('polygon', book, { ...pageAttributes, opacity: 0 });
  make('path', book, {
    'd': BOOK_SHAPE.SPINE_PATH, 'fill': 'none', 'stroke': colourOf('paperFold'), 'stroke-width': BOOK_SHAPE.SPINE_STROKE_UNITS,
  });

  const notepad = make('g', flip, { opacity: 0 });
  make('polygon', notepad, {
    'points': NOTEPAD_SHAPE.POINTS, 'fill': colourOf('paper'), 'stroke': colourOf('paperEdge'), 'stroke-width': NOTEPAD_SHAPE.STROKE_UNITS, 'stroke-linejoin': 'round',
  });
  make('path', notepad, {
    'd':                NOTEPAD_SHAPE.BINDING_PATH,
    'fill':             'none',
    'stroke':           colourOf('graphite'),
    'stroke-width':     NOTEPAD_SHAPE.BINDING_STROKE_UNITS,
    'stroke-dasharray': `${NOTEPAD_SHAPE.BINDING_DASH_UNITS} ${NOTEPAD_SHAPE.BINDING_GAP_UNITS}`,
    'stroke-linecap':   'round',
  });
  const writtenLineAttributes = (strokeWidth: number) => ({
    'stroke': colourOf('paperEdge'), 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'opacity': 0,
  });
  const notepadLines = NOTEPAD_SHAPE.LINE_Y_UNITS.map(() => make('line', notepad, writtenLineAttributes(NOTEPAD_SHAPE.LINE_STROKE_UNITS)));

  const searchBar = make('g', flip, { opacity: 0 });
  make('rect', searchBar, {
    'x':            SEARCH_BAR_SHAPE.X_UNITS,
    'y':            SEARCH_BAR_SHAPE.Y_UNITS,
    'width':        SEARCH_BAR_SHAPE.WIDTH_UNITS,
    'height':       SEARCH_BAR_SHAPE.HEIGHT_UNITS,
    'rx':           SEARCH_BAR_SHAPE.CORNER_RADIUS_UNITS,
    'fill':         colourOf('paper'),
    'stroke':       colourOf('paperEdge'),
    'stroke-width': SEARCH_BAR_SHAPE.STROKE_UNITS,
  });
  make('circle', searchBar, {
    'cx':           SEARCH_BAR_SHAPE.ICON_CENTRE_X_UNITS,
    'cy':           SEARCH_BAR_SHAPE.ICON_CENTRE_Y_UNITS,
    'r':            SEARCH_BAR_SHAPE.ICON_RADIUS_UNITS,
    'fill':         'none',
    'stroke':       colourOf('paperEdge'),
    'stroke-width': SEARCH_BAR_SHAPE.STROKE_UNITS,
  });
  make('path', searchBar, {
    'd': SEARCH_BAR_SHAPE.ICON_HANDLE_PATH, 'fill': 'none', 'stroke': colourOf('paperEdge'), 'stroke-width': SEARCH_BAR_SHAPE.STROKE_UNITS, 'stroke-linecap': 'round',
  });
  const searchQuery = make('line', searchBar, {
    'y1':             SEARCH_BAR_SHAPE.QUERY_Y_UNITS,
    'y2':             SEARCH_BAR_SHAPE.QUERY_Y_UNITS,
    'stroke':         colourOf('graphite'),
    'stroke-width':   SEARCH_BAR_SHAPE.QUERY_STROKE_UNITS,
    'stroke-linecap': 'round',
  });

  const hologram = make('g', flip, { opacity: 0 });
  make('rect', hologram, {
    x:      HOLOGRAM_SHAPE.EMITTER_X_UNITS,
    y:      HOLOGRAM_SHAPE.EMITTER_Y_UNITS,
    width:  HOLOGRAM_SHAPE.EMITTER_WIDTH_UNITS,
    height: HOLOGRAM_SHAPE.EMITTER_HEIGHT_UNITS,
    rx:     HOLOGRAM_SHAPE.EMITTER_CORNER_RADIUS_UNITS,
    fill:   colourOf('graphite'),
  });
  make('path', hologram, {
    'd': HOLOGRAM_SHAPE.BEAMS_PATH, 'fill': 'none', 'stroke': colourOf('water'), 'stroke-width': HOLOGRAM_SHAPE.BEAMS_STROKE_UNITS, 'opacity': HOLOGRAM_SHAPE.BEAMS_OPACITY,
  });
  make('rect', hologram, {
    'x':            HOLOGRAM_SHAPE.PANEL_X_UNITS,
    'y':            HOLOGRAM_SHAPE.PANEL_Y_UNITS,
    'width':        HOLOGRAM_SHAPE.PANEL_WIDTH_UNITS,
    'height':       HOLOGRAM_SHAPE.PANEL_HEIGHT_UNITS,
    'rx':           HOLOGRAM_SHAPE.PANEL_CORNER_RADIUS_UNITS,
    'fill':         colourOf('water'),
    'fill-opacity': HOLOGRAM_SHAPE.PANEL_FILL_OPACITY,
    'stroke':       colourOf('water'),
    'stroke-width': HOLOGRAM_SHAPE.PANEL_STROKE_UNITS,
  });
  make('path', hologram, {
    'd': HOLOGRAM_SHAPE.TEXT_PATH, 'fill': 'none', 'stroke': colourOf('water'), 'stroke-width': HOLOGRAM_SHAPE.TEXT_STROKE_UNITS, 'stroke-linecap': 'round',
  });
  const scanLine = make('rect', hologram, {
    x:      HOLOGRAM_SHAPE.SCAN_LINE_X_UNITS,
    y:      HOLOGRAM_SHAPE.SCAN_LINE_TOP_Y_UNITS,
    width:  HOLOGRAM_SHAPE.SCAN_LINE_WIDTH_UNITS,
    height: HOLOGRAM_SHAPE.SCAN_LINE_HEIGHT_UNITS,
    fill:   colourOf('waterLight'),
  });

  const ticket = make('g', flip, { opacity: 0 });
  make('polygon', ticket, {
    'points': PAPER_POINTS, 'fill': colourOf('paper'), 'stroke': colourOf('paperEdge'), 'stroke-width': TICKET_SHAPE.STROKE_UNITS, 'stroke-linejoin': 'round',
  });
  make('polygon', ticket, { points: TICKET_SHAPE.HEADER_POINTS, fill: colourOf('body') });
  const ticketLines = TICKET_SHAPE.LINE_Y_UNITS.map(() => make('line', ticket, writtenLineAttributes(TICKET_SHAPE.LINE_STROKE_UNITS)));
  const sealHalf = TICKET_SHAPE.SEAL_SIDE_UNITS / 2;
  const ticketSeal = make('rect', ticket, {
    x:         TICKET_SHAPE.SEAL_CENTRE_X_UNITS - sealHalf,
    y:         TICKET_SHAPE.SEAL_CENTRE_Y_UNITS - sealHalf,
    width:     TICKET_SHAPE.SEAL_SIDE_UNITS,
    height:    TICKET_SHAPE.SEAL_SIDE_UNITS,
    fill:      colourOf('body'),
    transform: `rotate(${TICKET_SHAPE.SEAL_TURN_DEGREES} ${TICKET_SHAPE.SEAL_CENTRE_X_UNITS} ${TICKET_SHAPE.SEAL_CENTRE_Y_UNITS})`,
    opacity:   0,
  });

  const body = make('g', flip);
  const bodyElement = make('path', body, { 'd': BODY_SHAPE.PATH, 'fill': colourOf('body'), 'pointer-events': 'visiblePainted' });
  const glow = make('path', body, { d: BODY_SHAPE.GLOW_PATH, fill: colourOf('glow'), opacity: 0 });
  const eyes = [EYE_SHAPE.LEFT_EYE_X_UNITS, EYE_SHAPE.RIGHT_EYE_X_UNITS].map(() => make('rect', body, { fill: colourOf('eye') }));
  const happyEyes = make('path', body, {
    'd': EYE_SHAPE.HAPPY_EYES_PATH, 'fill': 'none', 'stroke': colourOf('eye'), 'stroke-width': EYE_SHAPE.HAPPY_EYES_STROKE_UNITS, 'stroke-linecap': 'round', 'opacity': 0,
  });

  const glassHandle = make('line', flip, {
    'stroke': colourOf('graphite'), 'stroke-width': LOOKING_GLASS_SHAPE.HANDLE_STROKE_UNITS, 'stroke-linecap': 'round', 'opacity': 0,
  });
  const glass = make('g', flip, { opacity: 0 });
  make('circle', glass, {
    'r':            LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS,
    'fill':         colourOf('lens'),
    'fill-opacity': LOOKING_GLASS_SHAPE.LENS_OPACITY,
    'stroke':       colourOf('graphite'),
    'stroke-width': LOOKING_GLASS_SHAPE.RING_STROKE_UNITS,
  });

  const nearHand = make('polygon', flip, { fill: colourOf('hand') });

  const emote = make('g', figure, { display: 'none' });
  const markGroups = Object.fromEntries(EMOTE_MARK_NAMES.map((name) => [name, make('g', emote, { display: 'none' })])) as Record<EmoteMarkName, SVGGElement>;
  make('path', markGroups['anger-vein'], {
    'd': ANGER_VEIN_SHAPE.PATH, 'fill': 'none', 'stroke': colourOf('alarm'), 'stroke-width': ANGER_VEIN_SHAPE.STROKE_UNITS, 'stroke-linecap': 'round',
  });
  make('path', markGroups['sweat-drop'], { d: SWEAT_DROP_SHAPE.PATH, fill: colourOf('water') });
  make('rect', markGroups['sweat-drop'], {
    x:      SWEAT_DROP_SHAPE.HIGHLIGHT_X_UNITS,
    y:      SWEAT_DROP_SHAPE.HIGHLIGHT_Y_UNITS,
    width:  SWEAT_DROP_SHAPE.HIGHLIGHT_WIDTH_UNITS,
    height: SWEAT_DROP_SHAPE.HIGHLIGHT_HEIGHT_UNITS,
    fill:   colourOf('waterLight'),
  });
  const markText = (parent: SVGGElement, text: string, sizeUnits: number): void => {
    const element = make('text', parent, {
      'x':           0,
      'y':           MARK_TEXT_SHAPE.BASELINE_Y_UNITS,
      'text-anchor': 'middle',
      'font-family': MARK_TEXT_SHAPE.FONT_FAMILY,
      'font-size':   sizeUnits,
      'font-weight': MARK_TEXT_SHAPE.FONT_WEIGHT,
      'fill':        colourOf('hand'),
    });
    element.appendChild(options.document.createTextNode(text));
  };
  markText(markGroups.exclamation, MARK_TEXT_SHAPE.EXCLAMATION_TEXT, MARK_TEXT_SHAPE.EXCLAMATION_SIZE_UNITS);
  markText(markGroups.question, MARK_TEXT_SHAPE.QUESTION_TEXT, MARK_TEXT_SHAPE.QUESTION_SIZE_UNITS);
  markText(markGroups.greeting, MARK_TEXT_SHAPE.GREETING_TEXT, MARK_TEXT_SHAPE.GREETING_SIZE_UNITS);
  const thinkingDots = THINKING_DOTS_SHAPE.X_UNITS.map((dotX) => make('rect', markGroups['thinking-dots'], {
    x: dotX, y: THINKING_DOTS_SHAPE.Y_UNITS, width: THINKING_DOTS_SHAPE.SIDE_UNITS, height: THINKING_DOTS_SHAPE.SIDE_UNITS, fill: colourOf('thinking'), opacity: 0,
  }));
  const lightbulbRays = make('path', markGroups.lightbulb, {
    'd': LIGHTBULB_SHAPE.RAYS_PATH, 'fill': 'none', 'stroke': colourOf('bulbRays'), 'stroke-width': LIGHTBULB_SHAPE.RAYS_STROKE_UNITS, 'stroke-linecap': 'round', 'opacity': 0,
  });
  make('path', markGroups.lightbulb, {
    'd':               LIGHTBULB_SHAPE.GLASS_PATH,
    'fill':            `url(#${OVERLAY.BULB_GLASS_GRADIENT_ID})`,
    'stroke':          colourOf('bulbOutline'),
    'stroke-width':    LIGHTBULB_SHAPE.GLASS_STROKE_UNITS,
    'stroke-linejoin': 'round',
  });
  make('rect', markGroups.lightbulb, {
    x:      LIGHTBULB_SHAPE.FIRST_BAND_X_UNITS,
    y:      LIGHTBULB_SHAPE.FIRST_BAND_Y_UNITS,
    width:  LIGHTBULB_SHAPE.FIRST_BAND_WIDTH_UNITS,
    height: LIGHTBULB_SHAPE.FIRST_BAND_HEIGHT_UNITS,
    rx:     LIGHTBULB_SHAPE.BAND_CORNER_RADIUS_UNITS,
    fill:   `url(#${OVERLAY.BULB_FITTING_GRADIENT_ID})`,
  });
  make('rect', markGroups.lightbulb, {
    x:      LIGHTBULB_SHAPE.SECOND_BAND_X_UNITS,
    y:      LIGHTBULB_SHAPE.SECOND_BAND_Y_UNITS,
    width:  LIGHTBULB_SHAPE.SECOND_BAND_WIDTH_UNITS,
    height: LIGHTBULB_SHAPE.SECOND_BAND_HEIGHT_UNITS,
    rx:     LIGHTBULB_SHAPE.BAND_CORNER_RADIUS_UNITS,
    fill:   `url(#${OVERLAY.BULB_FITTING_GRADIENT_ID})`,
  });
  make('rect', markGroups.lightbulb, {
    x:      LIGHTBULB_SHAPE.CONTACT_X_UNITS,
    y:      LIGHTBULB_SHAPE.CONTACT_Y_UNITS,
    width:  LIGHTBULB_SHAPE.CONTACT_WIDTH_UNITS,
    height: LIGHTBULB_SHAPE.CONTACT_HEIGHT_UNITS,
    rx:     LIGHTBULB_SHAPE.CONTACT_CORNER_RADIUS_UNITS,
    fill:   colourOf('bulbContact'),
  });
  const glint = (glintX: number, glintY: number, side: number, role: FlintColourRole): void => {
    make('rect', markGroups['happy-glints'], {
      x:         glintX,
      y:         glintY,
      width:     side,
      height:    side,
      fill:      colourOf(role),
      transform: `rotate(${HAPPY_GLINTS_SHAPE.TURN_DEGREES} ${numberText(glintX + (side / 2))} ${numberText(glintY + (side / 2))})`,
    });
  };
  glint(HAPPY_GLINTS_SHAPE.LARGE_X_UNITS, HAPPY_GLINTS_SHAPE.LARGE_Y_UNITS, HAPPY_GLINTS_SHAPE.LARGE_SIDE_UNITS, 'body');
  glint(HAPPY_GLINTS_SHAPE.SMALL_X_UNITS, HAPPY_GLINTS_SHAPE.SMALL_Y_UNITS, HAPPY_GLINTS_SHAPE.SMALL_SIDE_UNITS, 'emberLight');
  const sweatBeadAttributes = { d: SWEAT_BEADS_SHAPE.PATH, fill: colourOf('water'), opacity: 0 };
  const sweatBeads = Array.from({ length: SWEAT_BEADS_SHAPE.COUNT }, () => make('path', markGroups['sweat-beads'], sweatBeadAttributes));

  const drawEmoteMark = (mark: EmoteMarkPose | null, facing: Facing): void => {
    setAttributes(emote, { display: mark === null ? 'none' : 'inline' });
    for (const name of EMOTE_MARK_NAMES) setAttributes(markGroups[name], { display: mark?.name === name ? 'inline' : 'none' });
    if (mark === null) return;
    setAttributes(emote, {
      transform: `translate(${numberText(facing * mark.anchorX)} ${numberText(mark.anchorY)}) scale(${numberText(mark.scale)})`,
      opacity:   mark.opacity,
    });
    setAttributes(markGroups[mark.name], { transform: `scale(${numberText(mark.innerScaleX)} ${numberText(mark.innerScaleY)})` });
    thinkingDots.forEach((dot, i) => setAttributes(dot, { opacity: i < mark.thinkingDotsShown ? 1 : 0 }));
    setAttributes(lightbulbRays, { opacity: mark.lightbulbRaysOpacity });
    sweatBeads.forEach((bead, i) => setAttributes(bead, placedAndTurned(mark.sweatBeads[i])));
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

  const drawProps = (pose: Pose): void => {
    const { props } = pose;
    const { facing } = pose.body;
    setAttributes(keyboard, { opacity: props.keyboard.shown, transform: translateText(0, props.keyboard.drop + ((1 - props.keyboard.shown) * KEYBOARD_SHAPE.SLIDE_UNITS)) });
    setAttributes(bolt, { opacity: props.bolt.shown, transform: translateText((1 - props.bolt.shown) * BOLT_SHAPE.SLIDE_UNITS, 0) });

    setAttributes(sheet, { opacity: props.sheet.shown, transform: translateText((1 - props.sheet.shown) * SHEET_SHAPE.SLIDE_UNITS, props.sheet.offsetY) });
    stackedPages.forEach((page, i) => setAttributes(page, { opacity: i < props.sheet.stackedPageCount ? 1 : 0 }));
    sheetLines.forEach((line, i) => setAttributes(line, { stroke: props.sheet.readLineIndex === i ? colourOf('body') : colourOf('paperText') }));
    setAttributes(sheetTick, { opacity: props.sheet.verdict === 'tick' ? 1 : 0, transform: tickTransformOf(TICK_SHAPE.SHEET_START_X_UNITS, facing) });
    setAttributes(sheetCross, { opacity: props.sheet.verdict === 'cross' ? 1 : 0 });

    const { merge: mergePose } = props;
    setAttributes(merge, { opacity: mergePose.shown });
    setAttributes(mergeTop, { y: mergePose.topBlockY, opacity: mergePose.blocksOpacity });
    setAttributes(mergeBottom, { y: mergePose.bottomBlockY, opacity: mergePose.blocksOpacity });
    setAttributes(merged, { opacity: mergePose.mergedOpacity, transform: translateText(mergePose.mergedOffsetX, mergePose.mergedOffsetY) });
    setAttributes(mergeTick, { opacity: mergePose.tickOpacity, transform: tickTransformOf(TICK_SHAPE.MERGE_START_X_UNITS, facing) });
    sparks.forEach((spark, i) => setAttributes(spark, placedAndTurned(mergePose.sparks[i])));

    setAttributes(book, { opacity: props.book.shown });
    const pageSpread = props.book.turningPageSpread;
    if (pageSpread === null) {
      setAttributes(turningPage, { opacity: 0 });
    } else {
      const pageX = BOOK_SHAPE.SPINE_X_UNITS + (BOOK_SHAPE.PAGE_WIDTH_UNITS * pageSpread);
      const pageTop = BOOK_SHAPE.PAGE_TOP_Y_UNITS - (BOOK_SHAPE.PAGE_RISE_UNITS * (1 - Math.abs(pageSpread)));
      setAttributes(turningPage, {
        opacity: 1,
        points:  `${BOOK_SHAPE.SPINE_X_UNITS},${BOOK_SHAPE.SPINE_TOP_Y_UNITS} ${numberText(pageX)},${numberText(pageTop)} `
          + `${numberText(pageX)},${numberText(pageTop + BOOK_SHAPE.PAGE_HEIGHT_UNITS)} ${BOOK_SHAPE.SPINE_X_UNITS},${BOOK_SHAPE.SPINE_BOTTOM_Y_UNITS}`,
      });
    }

    setAttributes(notepad, { opacity: props.notepad.shown });
    notepadLines.forEach((line, i) => setAttributes(line, writtenLineOf(
      NOTEPAD_SHAPE.LINE_START_X_UNITS, NOTEPAD_SHAPE.LINE_Y_UNITS[i] ?? 0, NOTEPAD_SHAPE.FULL_LINE_UNITS, props.notepad.writtenLengths[i] ?? 0, facing,
    )));

    setAttributes(searchBar, { opacity: props.searchBar.shown });
    const queryStart = SEARCH_BAR_SHAPE.QUERY_START_X_UNITS + (facing === 1 ? 0 : SEARCH_BAR_SHAPE.FULL_QUERY_UNITS);
    setAttributes(searchQuery, { x1: queryStart, x2: queryStart + (props.searchBar.queryLength * facing) });

    setAttributes(hologram, { opacity: props.hologram.shown * props.hologram.flicker });
    setAttributes(scanLine, { y: props.hologram.scanLineY });

    setAttributes(ticket, { opacity: props.ticket.shown * props.ticket.cycleOpacity, transform: translateText(props.ticket.offsetX, props.ticket.offsetY) });
    ticketLines.forEach((line, i) => setAttributes(line, writtenLineOf(
      TICKET_SHAPE.LINE_START_X_UNITS, TICKET_SHAPE.LINE_Y_UNITS[i] ?? 0, TICKET_SHAPE.FULL_LINE_UNITS, props.ticket.writtenLengths[i] ?? 0, facing,
    )));
    setAttributes(ticketSeal, { opacity: props.ticket.sealShown ? 1 : 0 });
  };

  const drawLookingGlass = (pose: Pose): void => {
    const lens = pose.props.lookingGlass;
    const hand = pose.nearHand;
    setAttributes(glass, { opacity: lens.shown, transform: `translate(${numberText(lens.centreX)} ${numberText(lens.centreY)}) scale(${numberText(lens.shown)})` });
    const holdsTheGlass = hand !== null && hand.placement === 'held-to-lens' && hand.radius > LOOKING_GLASS_SHAPE.HANDLE_MINIMUM_HAND_RADIUS_UNITS;
    if (!holdsTheGlass) {
      setAttributes(glassHandle, { opacity: 0 });
      return;
    }
    const gripX = hand.centreX - lens.centreX;
    const gripY = hand.centreY - lens.centreY;
    const gripLength = Math.max(1, Math.hypot(gripX, gripY));
    setAttributes(glassHandle, {
      opacity: lens.shown,
      x1:      lens.centreX + (gripX / gripLength * LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS),
      y1:      lens.centreY + (gripY / gripLength * LOOKING_GLASS_SHAPE.LENS_RADIUS_UNITS),
      x2:      hand.centreX,
      y2:      hand.centreY,
    });
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

  const draw = (pose: Pose): void => {
    const originY = pose.body.floorY - pose.body.jumpHeight - pose.body.hover - pose.body.lift;
    setAttributes(figure, { transform: `translate(${numberText(pose.body.positionX + pose.body.shake)} ${numberText(originY)})` });
    setAttributes(flip, { transform: `scale(${numberText(pose.body.facing * pose.body.sidewaysWidth)} 1)` });
    setAttributes(body, { transform: `rotate(${numberText(pose.body.leanDegrees)}) scale(${numberText(pose.body.widthFactor)} ${numberText(pose.body.heightFactor)})` });
    setAttributes(glow, { opacity: pose.sleep.glowOpacity });
    setAttributes(farHand, { points: polygonPointsOf(pose.farHand, pose.body.sidewaysWidth) });
    setAttributes(nearHand, { points: polygonPointsOf(pose.nearHand, pose.body.sidewaysWidth) });
    drawEyes(pose);
    drawProps(pose);
    drawLookingGlass(pose);
    drawEmoteMark(pose.emoteMark, pose.body.facing);
    embers.forEach((ember, i) => {
      const emberPose = pose.sleep.embers[i];
      setAttributes(ember, placedAndTurned(emberPose === undefined ? undefined : { ...emberPose, x: pose.body.positionX + emberPose.x, y: originY + emberPose.y }));
    });
    drawOcclusion(pose);
  };

  return { element: svg, bodyElement, draw };
}
