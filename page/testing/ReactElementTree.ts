/**
 * Test-only: unfolds what a hook-free component returns into its host elements, the tags and props React would hand the DOM, so a spec can
 * read the markup and call a handler without a document. A component that uses a hook, or an element type it does not know, fails loudly.
 */
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

function unfoldElement(element: ReactElement<ElementProps>): RenderedNode[] {
  const { type, props } = element;
  if (type === Fragment) return unfold(props.children);
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

function everyHostElementIn(nodes: readonly RenderedNode[]): HostElement[] {
  return nodes.flatMap((node) => (typeof node === 'string' ? [] : [node, ...everyHostElementIn(node.children)]));
}

export const ReactElementTree = {
  /** The host elements and texts a component's output unfolds to, in document order. */
  unfolded(node: ReactNode): RenderedNode[] {
    return unfold(node);
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

  /** Calls the element's handler, as the browser would for the event; a missing handler fails the spec. */
  dispatch(element: HostElement, handlerName: string, event: unknown = {}): void {
    const handler = element.props[handlerName];
    if (typeof handler !== 'function') throw new Error(`The <${element.tag}> element has no ${handlerName} handler.`);
    (handler as (dispatchedEvent: unknown) => void)(event);
  },
} as const;
