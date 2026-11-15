/**
 * Rendered markdown read as plain text. What matters: tags and their attributes leave no word behind, escaped characters read back as
 * the characters they stand for (an unknown name stays as written; a reference to no character reads as U+FFFD, since a throw here
 * takes down the Tickets and Epics views), white space collapses, and the summary is the first paragraph only.
 */
import { describe, expect, test } from 'bun:test';

import { HtmlTextUtil } from './HtmlTextUtil.ts';

describe('plainTextOf', () => {
  test('drops every tag with its attributes and collapses the white space between them', () => {
    expect(HtmlTextUtil.plainTextOf('<p>Pay <a href="https://example.com/checkout">here</a></p>\n<ul><li>now</li></ul>')).toBe('Pay here now');
  });

  test('reads named, decimal and hexadecimal references back and leaves an unknown name as written', () => {
    expect(HtmlTextUtil.plainTextOf('a &amp; b &lt;c&gt; &#65;&#x42; &copy;')).toBe('a & b <c> AB &copy;');
  });

  test('reads a reference to no character, out of range or zero, as the replacement character instead of throwing', () => {
    expect(HtmlTextUtil.plainTextOf('<p>Hello &#9999999; and &#xFFFFFF; or &#0; there</p>')).toBe('Hello \ufffd and \ufffd or \ufffd there');
  });
});

describe('firstParagraphTextOf', () => {
  test('is the first paragraph\'s words alone', () => {
    expect(HtmlTextUtil.firstParagraphTextOf('<p>One <em>page</em> checkout.</p><p>Second paragraph.</p>')).toBe('One page checkout.');
  });

  test('is empty when the markup opens no paragraph', () => {
    expect(HtmlTextUtil.firstParagraphTextOf('<ul><li>a list</li></ul>')).toBe('');
  });
});
