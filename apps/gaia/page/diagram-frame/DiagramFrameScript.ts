/**
 * The diagram frame's one script, served as a classic bundle with mermaid: it draws the source its page sends, answers with the drawing's height
 * and nodes, and reports the node under the pointer. It runs sandboxed, takes messages only from its parent and of its own protocol and version,
 * and holds no colour: each arrives as a theme variable.
 */
import mermaid from 'mermaid';

import { PAGE_CONTRACT_VERSIONS } from '../../src/shared/constants/PageContractVersions.ts';
import {
  DIAGRAM_FRAME_PROTOCOL,
  type DiagramFrameAnswer,
  type DiagramFrameRequest,
  type DiagramNode,
} from '../shared/@types/DiagramFrameMessages.ts';

type DiagramFrameAnswerContent = DiagramFrameAnswer extends infer Answer ? Answer extends unknown ? Omit<Answer, 'protocol' | 'protocolVersion'> : never : never;

const DIAGRAM_CONTAINER_ID = 'diagram';
const NODE_SELECTOR = 'g.node';
const DRAWING_ID_PREFIX = 'diagram-';
const DARK_MODE_VARIABLE = 'darkMode';
const DARK_MODE_ON = 'true';
const SVG_MEDIA_TYPE = 'image/svg+xml';

/** Mermaid names a node's group `<diagram kind>-<node id>-<counter>`, after the drawing's own id where it sets one. */
const MERMAID_NODE_ELEMENT_ID = /^[A-Za-z]+-(.+)-\d+$/;

/** A page in another origin than its frame's opaque one can be named by no target origin; what goes out is only what it sent in. */
const ANY_TARGET_ORIGIN = '*';

let drawingNumber = 0;
let hoveredNode: Element | null = null;
let reportedHeightPixels: number | null = null;
let reportedNodes: readonly DiagramNode[] = [];
let drawingIsShown = false;

function post(content: DiagramFrameAnswerContent): void {
  const answer = { protocol: DIAGRAM_FRAME_PROTOCOL, protocolVersion: PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame, ...content } as DiagramFrameAnswer;
  window.parent.postMessage(answer, ANY_TARGET_ORIGIN);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function themeVariablesOf(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, variable]) => typeof variable === 'string') ? Object.fromEntries(entries) as Record<string, string> : null;
}

/** A render request of this protocol and version from the frame's own parent; anything else is dropped. */
function requestOf(event: MessageEvent): DiagramFrameRequest | null {
  if (event.source !== window.parent) return null;
  const { data } = event as { readonly data: unknown };
  if (!isRecord(data)) return null;
  if (data['protocol'] !== DIAGRAM_FRAME_PROTOCOL || data['protocolVersion'] !== PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame) return null;
  const themeVariables = themeVariablesOf(data['themeVariables']);
  const { source } = data;
  if (data['kind'] !== 'render' || typeof source !== 'string' || themeVariables === null) return null;
  return {
    protocol: DIAGRAM_FRAME_PROTOCOL, protocolVersion: PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame, kind: 'render', source, themeVariables,
  };
}

function containerOf(): HTMLElement {
  const container = document.getElementById(DIAGRAM_CONTAINER_ID);
  if (container === null) throw new Error('The diagram frame\'s page holds no diagram container.');
  return container;
}

function nodeIdOf(element: Element, drawingId: string): string {
  const mermaidNodeId = element.getAttribute('data-id');
  if (mermaidNodeId !== null && mermaidNodeId !== '') return mermaidNodeId;
  const drawingPrefix = `${drawingId}-`;
  const elementId = element.id.startsWith(drawingPrefix) ? element.id.slice(drawingPrefix.length) : element.id;
  return MERMAID_NODE_ELEMENT_ID.exec(elementId)?.[1] ?? elementId;
}

function nodesOf(drawing: Element, drawingId: string): readonly DiagramNode[] {
  const nodes = new Map<string, DiagramNode>();
  for (const element of drawing.querySelectorAll(NODE_SELECTOR)) {
    const nodeId = nodeIdOf(element, drawingId);
    if (!nodes.has(nodeId)) nodes.set(nodeId, { nodeId, label: (element.textContent ?? '').trim() });
  }
  return [...nodes.values()];
}

function postRendered(): void {
  if (!drawingIsShown) return;
  const heightPixels = Math.ceil(containerOf().getBoundingClientRect().height);
  if (heightPixels === reportedHeightPixels) return;
  reportedHeightPixels = heightPixels;
  post({ kind: 'rendered', heightPixels, nodes: reportedNodes });
}

function configureMermaid(themeVariables: Readonly<Record<string, string>>): void {
  const darkMode = themeVariables[DARK_MODE_VARIABLE] === DARK_MODE_ON;
  document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  mermaid.initialize({
    startOnLoad:            false,
    securityLevel:          'strict',
    htmlLabels:             false,
    suppressErrorRendering: true,
    theme:                  'base',
    darkMode,
    themeVariables:         { ...themeVariables, darkMode },
  });
}

/** Mermaid's drawing, already sanitized by its strict level, parsed as SVG and adopted, so no markup string is set on the page. */
function drawingElementOf(svgText: string): Element {
  const parsed = new DOMParser().parseFromString(svgText, SVG_MEDIA_TYPE);
  return document.importNode(parsed.documentElement, true);
}

async function draw(request: DiagramFrameRequest): Promise<void> {
  drawingNumber += 1;
  const thisDrawingNumber = drawingNumber;
  const drawingId = `${DRAWING_ID_PREFIX}${thisDrawingNumber}`;
  configureMermaid(request.themeVariables);
  let svgText: string;
  try {
    ({ svg: svgText } = await mermaid.render(drawingId, request.source));
  } catch (error) {
    if (thisDrawingNumber !== drawingNumber) return;
    drawingIsShown = false;
    hoveredNode = null;
    containerOf().replaceChildren();
    post({ kind: 'render-failed', reason: error instanceof Error ? error.message : String(error) });
    return;
  }
  // A newer source came while this one drew; only the newest is shown.
  if (thisDrawingNumber !== drawingNumber) return;
  const drawing = drawingElementOf(svgText);
  hoveredNode = null;
  containerOf().replaceChildren(drawing);
  reportedNodes = nodesOf(drawing, drawingId);
  reportedHeightPixels = null;
  drawingIsShown = true;
  postRendered();
}

function nodeElementAt(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(NODE_SELECTOR) : null;
}

function drawingIdOf(node: Element): string {
  return node.closest('svg')?.id ?? '';
}

function onPointerOver(event: PointerEvent): void {
  const node = nodeElementAt(event.target);
  if (node === null || node === hoveredNode) return;
  hoveredNode = node;
  const place = node.getBoundingClientRect();
  post({
    kind: 'node-hovered', nodeId: nodeIdOf(node, drawingIdOf(node)), top: place.top, left: place.left,
  });
}

function onPointerOut(event: PointerEvent): void {
  if (hoveredNode === null || nodeElementAt(event.relatedTarget) === hoveredNode) return;
  hoveredNode = null;
  post({ kind: 'node-left' });
}

function onMessage(event: MessageEvent): void {
  const request = requestOf(event);
  if (request !== null) void draw(request);
}

const container = containerOf();
container.addEventListener('pointerover', onPointerOver);
container.addEventListener('pointerout', onPointerOut);
new ResizeObserver(postRendered).observe(container);
window.addEventListener('message', onMessage);
