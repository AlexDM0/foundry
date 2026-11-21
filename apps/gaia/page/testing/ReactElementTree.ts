/**
 * Test-only: unfolds what a hook-free component returns into its host elements, the tags and props React would hand the DOM, so a spec can
 * read the markup and call a handler without a document. Every component the design-system library exports stays folded, so a spec reads
 * the props Gaia hands a package part and never the markup the package draws. A component that uses a hook, or an element type it does not
 * know, fails loudly.
 */
import { readFileSync }  from 'node:fs';
import { createRequire } from 'node:module';

import {
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface HostElement {
  readonly tag:      string;
  readonly props:    Readonly<Record<string, unknown>>;
  readonly children: readonly RenderedNode[];
}

export type RenderedNode = HostElement | string;

type ElementProps = Readonly<Record<string, unknown>> & { readonly children?: ReactNode };

/** The interface files of the libraries whose components stay folded, whatever they draw inside and whichever hooks they hold. */
const FOLDED_LIBRARY_INTERFACE_SPECIFIERS = ['../lib/design-system/DesignSystemInterface.ts'] as const;

/** A library's components are the values its interface file exports from a `.tsx` module; its types, constants and utils are not. */
const COMPONENT_EXPORT_STATEMENT = /^export \{([^}]*)\} from '[^']+\.tsx';$/gmu;

const requireFromHere = createRequire(import.meta.url);

let packageComponentsFound: ReadonlySet<unknown> | undefined;

function componentsExportedBy(interfaceSpecifier: string): unknown[] {
  const interfaceText = readFileSync(requireFromHere.resolve(interfaceSpecifier), 'utf8');
  const componentNames = [...interfaceText.matchAll(COMPONENT_EXPORT_STATEMENT)]
    .flatMap(([, names = '']) => names.split(',').map((name) => name.trim()).filter((name) => name !== ''));
  const exported = requireFromHere(interfaceSpecifier) as Readonly<Record<string, unknown>>;
  return componentNames.map((name) => exported[name]).filter((component) => typeof component === 'function');
}

/** Read from the library's own interface file on the first unfold, so a component the library adds stays folded with no list kept here. */
function packageComponents(): ReadonlySet<unknown> {
  packageComponentsFound ??= new Set(FOLDED_LIBRARY_INTERFACE_SPECIFIERS.flatMap(componentsExportedBy));
  return packageComponentsFound;
}

/** Every element in a prop's value, also inside its lists and plain records, such as a table's rows of cells, in the order written. */
function elementsHandedIn(value: unknown): ReactNode[] {
  if (isValidElement(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(elementsHandedIn);
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).flatMap(elementsHandedIn);
  return [];
}

/** What Gaia handed a package part to show: its children, then every element its other props hold, in the order they were written. */
function handedNodesOf(props: ElementProps): RenderedNode[] {
  return Object.entries(props).flatMap(([propName, value]) => (propName === 'children' ? unfold(value as ReactNode) : elementsHandedIn(value).flatMap(unfold)));
}

function unfoldElement(element: ReactElement<ElementProps>): RenderedNode[] {
  const { type, props } = element;
  if (type === Fragment) return unfold(props.children);
  if (typeof type === 'function' && packageComponents().has(type)) return [{ tag: type.name, props, children: handedNodesOf(props) }];
  if (typeof type === 'function') return unfold((type as (componentProps: ElementProps) => ReactNode)(props));
  if (typeof type === 'string') return [{ tag: type, props, children: unfold(props.children) }];
  throw new Error(`The element tree cannot unfold an element of type ${String(type)}.`);
}

function unfold(node: ReactNode): RenderedNode[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => unfold(child));
  if (isValidElement<ElementProps>(node)) return unfoldElement(node);
  throw new Error('The element tree cannot unfold this node.');
}

/** A folded package part stands under its component's name, which starts in capitals, as no host tag does. */
const COMPONENT_NAME = /^[A-Z]/;

/** The props a package part shows as its words, in the order they are looked for. */
const WORDS_PROPS = ['text', 'label', 'shortText'] as const;

function readingOf(node: RenderedNode): string {
  if (typeof node === 'string') return node;
  const childrenReading = node.children.map(readingOf).join('');
  if (!COMPONENT_NAME.test(node.tag)) return childrenReading;
  const words = WORDS_PROPS.map((propName) => node.props[propName]).find((value) => typeof value === 'string' || typeof value === 'number');
  return words === undefined ? childrenReading : `[${node.tag} ${String(words)}]${childrenReading}`;
}

function everyHostElementIn(nodes: readonly RenderedNode[]): HostElement[] {
  return nodes.flatMap((node) => (typeof node === 'string' ? [] : [node, ...everyHostElementIn(node.children)]));
}

export const ReactElementTree = {
  /**
   * The host elements and texts a component's output unfolds to, in document order. A package component stands in it under its own name
   * with the props it was given, and holds only what Gaia handed it to show, unfolded: its children, then every element in its other props.
   */
  unfolded(node: ReactNode): RenderedNode[] {
    return unfold(node);
  },

  /** What a folded package component was handed in one of its props, such as a banner's text or a card's title, unfolded in turn. */
  unfoldedProp(element: HostElement, propName: string): RenderedNode[] {
    return unfold(element.props[propName] as ReactNode);
  },

  /** Every host element, at any depth, that the predicate keeps. */
  hostElementsIn(nodes: readonly RenderedNode[], keeps: (element: HostElement) => boolean = () => true): HostElement[] {
    return everyHostElementIn(nodes).filter(keeps);
  },

  /** The one host element the predicate keeps; none or several fail the spec. */
  onlyHostElementIn(nodes: readonly RenderedNode[], keeps: (element: HostElement) => boolean): HostElement {
    const kept = everyHostElementIn(nodes).filter(keeps);
    const [only] = kept;
    if (kept.length !== 1 || only === undefined) throw new Error(`Expected exactly one matching element, found ${kept.length}.`);
    return only;
  },

  /** The one host element carrying this class. */
  onlyWithClass(nodes: readonly RenderedNode[], className: string): HostElement {
    return ReactElementTree.onlyHostElementIn(nodes, ReactElementTree.withClass(className));
  },

  /** The one host element of this tag. */
  onlyWithTag(nodes: readonly RenderedNode[], tag: string): HostElement {
    return ReactElementTree.onlyHostElementIn(nodes, ReactElementTree.withTag(tag));
  },

  /** Whether an element is a package component kept folded. */
  isPackagePart(element: HostElement): boolean {
    return COMPONENT_NAME.test(element.tag);
  },

  /**
   * The text, with each folded package part written in its place as `[Name words]`, its words the text, label or short text Gaia handed
   * it, then what Gaia handed it to show; a part with no words is only what it was handed. A spec claims a whole line this way without
   * reading what the package draws.
   */
  readingOf(nodes: readonly RenderedNode[]): string {
    return nodes.map(readingOf).join('');
  },

  /** The text a reader sees, concatenated in document order. */
  textOf(nodes: readonly RenderedNode[]): string {
    return nodes.map((node) => (typeof node === 'string' ? node : ReactElementTree.textOf(node.children))).join('');
  },

  /** Whether an element carries this class among its classes. */
  hasClass(element: HostElement, className: string): boolean {
    const classes = element.props['className'];
    return typeof classes === 'string' && classes.split(/\s+/).includes(className);
  },

  /** A predicate that keeps the elements carrying this class. */
  withClass(className: string): (element: HostElement) => boolean {
    return (element) => ReactElementTree.hasClass(element, className);
  },

  /** A predicate that keeps the elements of this tag. */
  withTag(tag: string): (element: HostElement) => boolean {
    return (element) => element.tag === tag;
  },

  /** A predicate that keeps the folded elements of this package component. */
  withComponent(component: { readonly name: string }): (element: HostElement) => boolean {
    return ReactElementTree.withTag(component.name);
  },

  /** The one folded element of this package component. */
  onlyOfComponent(nodes: readonly RenderedNode[], component: { readonly name: string }): HostElement {
    return ReactElementTree.onlyHostElementIn(nodes, ReactElementTree.withComponent(component));
  },

  /** Calls the element's handler, as the browser would for the event; a missing handler fails the spec. */
  dispatch(element: HostElement, handlerName: string, event: unknown = {}): void {
    const handler = element.props[handlerName];
    if (typeof handler !== 'function') throw new Error(`The <${element.tag}> element has no ${handlerName} handler.`);
    (handler as (dispatchedEvent: unknown) => void)(event);
  },
} as const;
