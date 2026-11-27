/**
 * Test-only: reads the markup `react-dom/server` writes as a tree, so a spec finds a control by its role and name, a text by what it reads,
 * and a part of Gaia's by its own class, never by what a package draws. A package part is claimed whole, as learned from the package itself.
 */
import type { ReactElement }    from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface MarkupElement {
  readonly tag:        string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children:   readonly MarkupNode[];
  /** The element's own markup, from its opening tag to its closing one. */
  readonly source:     string;
}

/** A text node, its character references read. */
export type MarkupNode = MarkupElement | string;

interface OpenElement {
  readonly tag:        string;
  readonly attributes: Record<string, string>;
  readonly children:   MarkupNode[];
  readonly start:      number;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Elements whose content is raw text, which the tree keeps as one text node. */
const RAW_TEXT_TAGS = new Set(['script', 'style']);

/** A comment or doctype, a closing tag, or an opening tag with its attributes, every value double-quoted as React writes them. */
const TAG = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'=/>]+(?:="[^"]*")?)*)\s*\/?>/g;

const ATTRIBUTE = /([^\s"'=/>]+)(?:="([^"]*)")?/g;

const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  amp:  '&',
  lt:   '<',
  gt:   '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
};

/** The roles HTML gives an element without a `role` attribute, for the elements Gaia's screens draw. */
const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  button:   'button',
  dialog:   'dialog',
  h1:       'heading',
  h2:       'heading',
  h3:       'heading',
  h4:       'heading',
  h5:       'heading',
  h6:       'heading',
  nav:      'navigation',
  main:     'main',
  ul:       'list',
  ol:       'list',
  li:       'listitem',
  table:    'table',
  textarea: 'textbox',
};

const INPUT_ROLES: Readonly<Record<string, string>> = {
  checkbox: 'checkbox',
  radio:    'radio',
  text:     'textbox',
};

/** The prefix of every class Gaia's own components emit; a spec finds nothing by a package's class. */
const GAIA_CLASS_PREFIX = 'gaia-';

function textOfReferences(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (reference, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return Object.hasOwn(NAMED_REFERENCES, name) ? NAMED_REFERENCES[name] ?? reference : reference;
  });
}

function attributesOf(attributeText: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name = '', value = ''] of attributeText.matchAll(ATTRIBUTE)) attributes[name] = textOfReferences(value);
  return attributes;
}

function parse(markup: string): MarkupElement {
  const root: OpenElement = {
    tag: '#fragment', attributes: {}, children: [], start: 0
  };
  const openElements: OpenElement[] = [root];
  const currentElement = () => openElements[openElements.length - 1] ?? root;
  const close = (end: number) => {
    const closed = openElements.pop();
    if (closed === undefined || closed === root) throw new Error('The markup closes an element it never opened.');
    currentElement().children.push({
      tag: closed.tag, attributes: closed.attributes, children: closed.children, source: markup.slice(closed.start, end)
    });
  };
  let position = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(markup); match !== null; match = TAG.exec(markup)) {
    if (match.index > position) currentElement().children.push(textOfReferences(markup.slice(position, match.index)));
    position = TAG.lastIndex;
    const [whole, closingTag, openingTag, attributeText = ''] = match;
    if (closingTag !== undefined) {
      if (currentElement().tag !== closingTag.toLowerCase()) throw new Error(`The markup closes <${closingTag}> inside <${currentElement().tag}>.`);
      close(position);
      continue;
    }
    if (openingTag === undefined) continue;
    const tag = openingTag.toLowerCase();
    openElements.push({
      tag, attributes: attributesOf(attributeText), children: [], start: match.index
    });
    if (VOID_TAGS.has(tag) || whole.endsWith('/>')) {
      close(position);
      continue;
    }
    if (RAW_TEXT_TAGS.has(tag)) {
      const rawEnd = markup.indexOf(`</${tag}`, position);
      if (rawEnd < 0) throw new Error(`The markup never closes <${tag}>.`);
      if (rawEnd > position) currentElement().children.push(markup.slice(position, rawEnd));
      TAG.lastIndex = rawEnd;
      position = rawEnd;
    }
  }
  if (position < markup.length) currentElement().children.push(textOfReferences(markup.slice(position)));
  if (openElements.length !== 1) throw new Error(`The markup leaves <${currentElement().tag}> open.`);
  return {
    tag: root.tag, attributes: root.attributes, children: root.children, source: markup
  };
}

function everyElementIn(element: MarkupElement): MarkupElement[] {
  return element.children.flatMap((child) => (typeof child === 'string' ? [] : [child, ...everyElementIn(child)]));
}

function textOf(node: MarkupNode, skipsHidden: boolean): string {
  if (typeof node === 'string') return node;
  if (skipsHidden && node.attributes['aria-hidden'] === 'true') return '';
  return node.children.map((child) => textOf(child, skipsHidden)).join('');
}

function onlyRootOf(element: ReactElement): MarkupElement {
  const [root, ...others] = parse(renderToStaticMarkup(element)).children;
  if (root === undefined || typeof root === 'string' || others.length > 0) throw new Error('The package part draws no single root element.');
  return root;
}

export const MarkupTree = {
  /** The markup as a tree under one fragment element; markup it cannot read fails the spec. */
  parse(markup: string): MarkupElement {
    return parse(markup);
  },

  /** Every element under this one, at any depth, that the predicate keeps, in document order. */
  elementsIn(element: MarkupElement, keeps: (candidate: MarkupElement) => boolean = () => true): MarkupElement[] {
    return everyElementIn(element).filter(keeps);
  },

  /** The one element under this one that the predicate keeps; none or several fail the spec. */
  onlyElementIn(element: MarkupElement, keeps: (candidate: MarkupElement) => boolean): MarkupElement {
    const kept = everyElementIn(element).filter(keeps);
    const [only] = kept;
    if (kept.length !== 1 || only === undefined) throw new Error(`Expected exactly one matching element, found ${kept.length}.`);
    return only;
  },

  /** The text a reader sees, in document order, its character references read. */
  textOf(node: MarkupNode): string {
    return textOf(node, false);
  },

  /** The element's role: its `role` attribute, or the one HTML gives its tag. */
  roleOf(element: MarkupElement): string | null {
    const explicitRole = element.attributes['role'];
    if (explicitRole !== undefined) return explicitRole;
    if (element.tag === 'a' && element.attributes['href'] !== undefined) return 'link';
    if (element.tag === 'input') return INPUT_ROLES[element.attributes['type'] ?? 'text'] ?? null;
    return Object.hasOwn(IMPLICIT_ROLES, element.tag) ? IMPLICIT_ROLES[element.tag] ?? null : null;
  },

  /** The element's accessible name: its `aria-label`, or else the text it holds outside what is hidden from assistive technology. */
  nameOf(element: MarkupElement): string {
    return element.attributes['aria-label'] ?? textOf(element, true);
  },

  /** A predicate that keeps the elements of this role, and of this accessible name when one is given. */
  withRole(role: string, name?: string | RegExp): (element: MarkupElement) => boolean {
    return (element) => {
      if (MarkupTree.roleOf(element) !== role) return false;
      if (name === undefined) return true;
      const accessibleName = MarkupTree.nameOf(element);
      return typeof name === 'string' ? accessibleName === name : name.test(accessibleName);
    };
  },

  /** A predicate that keeps the elements carrying this class of Gaia's own; a package's class is refused, since a package's insides may change. */
  withClass(className: string): (element: MarkupElement) => boolean {
    if (!className.startsWith(GAIA_CLASS_PREFIX)) throw new Error(`A spec finds no element by the class ${className}, which is not Gaia's own.`);
    return (element) => (element.attributes['class'] ?? '').split(/\s+/).includes(className);
  },

  /** The texts of the elements carrying this class of Gaia's own, in document order. */
  textsOfClass(element: MarkupElement, className: string): string[] {
    return everyElementIn(element).filter(MarkupTree.withClass(className)).map(MarkupTree.textOf);
  },

  /** The markup a package part draws for these props, which a screen holds whole wherever Gaia hands the part the same. */
  drawnMarkupOf(element: ReactElement): string {
    return renderToStaticMarkup(element);
  },

  /** The attributes a variant prop adds to or changes on a package part's root, learned by drawing the part without it and with it. */
  variantAttributesOf(withoutVariant: ReactElement, withVariant: ReactElement): Readonly<Record<string, string>> {
    const plainAttributes = onlyRootOf(withoutVariant).attributes;
    const variantAttributes = onlyRootOf(withVariant).attributes;
    const added = Object.entries(variantAttributes).filter(([name, value]) => !Object.hasOwn(plainAttributes, name) || plainAttributes[name] !== value);
    if (added.length === 0) throw new Error('The variant adds nothing to the package part\'s root.');
    return Object.fromEntries(added);
  },

  /** Whether the element carries every one of these attributes at its value. */
  carries(element: MarkupElement, attributes: Readonly<Record<string, string>>): boolean {
    return Object.entries(attributes).every(([name, value]) => element.attributes[name] === value);
  },
} as const;
