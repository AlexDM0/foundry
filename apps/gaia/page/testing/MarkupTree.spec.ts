/**
 * The markup tree the visual harness reads server-rendered screens through. What matters: it reads what `react-dom/server` writes (void
 * elements, raw style text, character references) into elements that keep their own source; a role and an accessible name come from the
 * attributes and the tag as a browser would take them; a package's class is refused as a way to find anything; a variant is learned from
 * the package part itself; and markup it cannot read fails rather than passing as empty.
 */
import { describe, expect, test } from 'bun:test';
import { createElement }          from 'react';
import { Button }                 from '../lib/design-system/DesignSystemInterface.ts';

import { MarkupTree } from './MarkupTree.ts';

const EXAMPLE_MARKUP = [
  '<!doctype html><style>.a > .b { color: red; }</style>',
  '<nav class="gaia-example-rail" aria-label="Example rail"><a href="#one">One</a></nav>',
  '<section class="gaia-example extra"><h1>Alex Example&#x27;s &amp; title</h1>',
  '<button type="button"><span aria-hidden="true">×</span>Close</button><input type="checkbox" checked=""/><br/>',
  '<div role="status" data-tone="quiet">Saved.</div></section>',
].join('');

describe('the markup tree', () => {
  test('reads elements, void elements and raw style text, each element keeping its own source', () => {
    const tree = MarkupTree.parse(EXAMPLE_MARKUP);
    const section = MarkupTree.onlyElementIn(tree, MarkupTree.withClass('gaia-example'));
    expect(section.source).toStartWith('<section class="gaia-example extra">');
    expect(section.source).toEndWith('</section>');
    expect(MarkupTree.elementsIn(section).map((element) => element.tag)).toEqual(['h1', 'button', 'span', 'input', 'br', 'div']);
    expect(MarkupTree.onlyElementIn(tree, (element) => element.tag === 'style').children).toEqual(['.a > .b { color: red; }']);
  });

  test('reads character references in text and in attribute values', () => {
    const tree = MarkupTree.parse(EXAMPLE_MARKUP);
    expect(MarkupTree.textsOfClass(tree, 'gaia-example')[0]).toStartWith('Alex Example\'s & title');
    expect(MarkupTree.parse('<p title="&quot;quoted&quot;">x</p>').children[0]).toMatchObject({ attributes: { title: '"quoted"' } });
  });

  test('gives each element its explicit role, or the one HTML gives its tag', () => {
    const tree = MarkupTree.parse(EXAMPLE_MARKUP);
    expect(MarkupTree.elementsIn(tree).map(MarkupTree.roleOf)).toEqual([null, 'navigation', 'link', null, 'heading', 'button', null, 'checkbox', null, 'status']);
  });

  test('names an element by its aria-label, or else by its text outside what is hidden from assistive technology', () => {
    const tree = MarkupTree.parse(EXAMPLE_MARKUP);
    expect(MarkupTree.elementsIn(tree, MarkupTree.withRole('navigation', 'Example rail'))).toHaveLength(1);
    const closeButton = MarkupTree.onlyElementIn(tree, MarkupTree.withRole('button', 'Close'));
    expect(MarkupTree.textOf(closeButton)).toBe('×Close');
    expect(MarkupTree.elementsIn(tree, MarkupTree.withRole('link', /^On/))).toHaveLength(1);
  });

  test('refuses to find an element by a class that is not Gaia\'s own', () => {
    expect(() => MarkupTree.withClass('design-system-button')).toThrow('not Gaia\'s own');
  });

  test('learns the attributes a variant prop adds to a package part\'s root, and finds the elements that carry them', () => {
    const primary = MarkupTree.variantAttributesOf(createElement(Button, { label: 'Example' }), createElement(Button, { label: 'Example', emphasis: 'primary' }));
    const drawnPrimary = MarkupTree.drawnMarkupOf(createElement(Button, { label: 'Start', emphasis: 'primary' }));
    const tree = MarkupTree.parse(`${drawnPrimary}${MarkupTree.drawnMarkupOf(createElement(Button, { label: 'Stop' }))}`);
    expect(MarkupTree.elementsIn(tree, (element) => MarkupTree.carries(element, primary)).map(MarkupTree.nameOf)).toEqual(['Start']);
    expect(() => MarkupTree.variantAttributesOf(createElement(Button, { label: 'Example' }), createElement(Button, { label: 'Example' }))).toThrow('adds nothing');
  });

  test('fails on markup it cannot read, and on a lookup that finds none or several', () => {
    expect(() => MarkupTree.parse('<div><span></div>')).toThrow('closes <div> inside <span>');
    expect(() => MarkupTree.parse('<div>')).toThrow('leaves <div> open');
    expect(() => MarkupTree.onlyElementIn(MarkupTree.parse(EXAMPLE_MARKUP), MarkupTree.withRole('table'))).toThrow('found 0');
  });
});
